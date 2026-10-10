import type { supabase } from '@/lib/supabase';
import { redactSupportErrorText, withSupportCode } from '@/lib/support-errors';
import { formatSupabaseAuthErrorMessage, readErrorMessage } from '../session/auth-errors';
import type { SocialAccountRegistrationInput } from '../session/types';
import { performNativeAppleAuth } from './apple-native-auth';
import { performNativeGoogleAuth } from './google-native-auth';
import { invokeSessionEdgeAction } from './session-edge-action';
import {
  SESSION_SOCIAL_AUTH_TIMEOUT_MS,
  sessionOperationErrorMessage,
  withSessionOperationTimeout,
} from './session-operation';
import { reportSocialAuthFailure } from './social-auth-reporting';

type SessionClient = NonNullable<typeof supabase>;

const REGISTRATION_AUTHORIZATION_ERROR =
  'No pudimos validar tu invitación para crear la cuenta. Inténtalo de nuevo.';
const GOOGLE_EMAIL_REGISTRATION_MESSAGE =
  'Google no está disponible para crear tu cuenta en este dispositivo. Usa «Usar correo y contraseña» con esta invitación.';

interface SocialRegistrationAuthorization {
  readonly authorized: true;
  readonly expiresAt: string;
}

async function authorizeSocialRegistration(input: {
  readonly client: SessionClient;
  readonly deliveryToken: string;
  readonly idToken: string;
  readonly nonce?: string;
  readonly provider: SocialAccountRegistrationInput['provider'];
}): Promise<string | null> {
  try {
    const result = await invokeSessionEdgeAction<SocialRegistrationAuthorization>({
      body: {
        deliveryToken: input.deliveryToken,
        idToken: input.idToken,
        ...(input.nonce ? { nonce: input.nonce } : {}),
        provider: input.provider,
      },
      client: input.client,
      name: 'prepare-social-registration',
    });
    if (!result.ok) {
      const mappedMessage = formatSupabaseAuthErrorMessage(result.code ?? '');
      const message =
        mappedMessage && mappedMessage !== result.code
          ? mappedMessage
          : REGISTRATION_AUTHORIZATION_ERROR;
      // Only retain the support identifier from the server response, never credential text.
      const supportId = result.message.match(/\bHC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
      return supportId ? withSupportCode(message, supportId) : message;
    }
    if (
      result.data?.authorized !== true ||
      typeof result.data.expiresAt !== 'string' ||
      !(Date.parse(result.data.expiresAt) > Date.now())
    ) {
      return REGISTRATION_AUTHORIZATION_ERROR;
    }
    return null;
  } catch (error) {
    return sessionOperationErrorMessage(error, REGISTRATION_AUTHORIZATION_ERROR);
  }
}

export async function performSocialAccountRegistration(input: {
  readonly client: SessionClient | null;
  readonly finishAuthenticatedSignIn: (userId: string) => Promise<void>;
  readonly platform: string;
  readonly publicClient: SessionClient | null;
  readonly registration: SocialAccountRegistrationInput;
}): Promise<string> {
  const deliveryToken = input.registration.deliveryToken.trim();
  if (!deliveryToken) {
    return formatSupabaseAuthErrorMessage('account_invite_required');
  }
  if (!input.client || !input.publicClient) {
    return 'El servicio de acceso no está disponible en este momento.';
  }
  const publicClient = input.publicClient;
  if (input.registration.provider === 'apple' && input.platform !== 'ios') {
    return 'Apple solo está disponible en iPhone. Usa «Usar correo y contraseña» con esta invitación.';
  }

  let registrationActive = true;
  const beforeSignIn = async (credential: {
    readonly idToken: string;
    readonly nonce?: string;
  }): Promise<string | null> => {
    if (!registrationActive) return REGISTRATION_AUTHORIZATION_ERROR;
    const message = await authorizeSocialRegistration({
      ...credential,
      client: publicClient,
      deliveryToken,
      provider: input.registration.provider,
    });
    return registrationActive ? message : REGISTRATION_AUTHORIZATION_ERROR;
  };

  try {
    const nativeInput = {
      beforeSignIn,
      client: input.client,
      mode: 'sign-in' as const,
      reportFailure: (failure: Parameters<typeof reportSocialAuthFailure>[0]) =>
        reportSocialAuthFailure({
          message: redactSupportErrorText(failure.message ?? readErrorMessage(failure.error), 1000),
          mode: failure.mode,
          provider: failure.provider,
          reason: failure.reason,
          stage: failure.stage,
        }),
    };
    const result = await withSessionOperationTimeout(
      `${input.registration.provider}-registration`,
      input.registration.provider === 'google'
        ? performNativeGoogleAuth(nativeInput)
        : performNativeAppleAuth(nativeInput),
      SESSION_SOCIAL_AUTH_TIMEOUT_MS,
    );
    if (result.userId) {
      await input.finishAuthenticatedSignIn(result.userId);
    } else if (result.message === 'Sesión iniciada.') {
      return 'No pudimos abrir la sesión de tu cuenta. Inténtalo de nuevo.';
    }
    if (
      input.registration.provider === 'google' &&
      'failureCode' in result &&
      (result.failureCode === 'native_unavailable' ||
        result.failureCode === 'native_configuration_missing' ||
        result.failureCode === 'play_services_unavailable')
    ) {
      return GOOGLE_EMAIL_REGISTRATION_MESSAGE;
    }
    return redactSupportErrorText(result.message, 1000);
  } catch (error) {
    return sessionOperationErrorMessage(error, 'No pudimos crear tu cuenta. Inténtalo de nuevo.');
  } finally {
    registrationActive = false;
  }
}
