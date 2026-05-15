import { MIN_ACCOUNT_INVITE_TOKEN_LENGTH, extractAccountInviteToken } from './account-invite-utils';

export type SocialProvider = 'google' | 'apple';
export type SignInEntryMode = 'sign-in' | 'recover';
export type AuthEntryMode = 'remembered' | 'other';
export type JoinEntrySurface = 'auth' | 'token';
export type RememberedReauthReason = 'biometric-failed' | 'session-expired';

export const AUTH_SUCCESS_NAVIGATION_DELAY_MS = 120;
export const AUTH_ROUTE_TRANSITION_HOLD_MS = 15000;
export const AUTH_ACTION_AFTER_KEYBOARD_DISMISS_MS = 90;
export const AUTH_CONTENT_EXIT_MS = 190;
export const AUTH_MODE_ROUTE_DELAY_MS = 520;
export const AUTH_SAME_POSITION_REVEAL_DELAY_MS = 180;
export const PASSWORD_RESET_SENT_MESSAGE =
  'Si el correo existe, enviamos un enlace para restablecer la contraseña.';
export const PASSWORD_RECOVERY_CODE_VERIFIED_MESSAGE = 'Código verificado.';
export const PASSWORD_RESET_RESEND_SECONDS = 60;

export function biometricMessage(error: string | null, label: string): string {
  if (error === 'user_cancel') {
    return `Cancelaste ${label}. Puedes entrar con correo y contraseña.`;
  }

  if (error === 'not_available') {
    return 'Este dispositivo no tiene biometría disponible. Entra con correo y contraseña.';
  }

  return `No pudimos validar ${label}. Entra con correo y contraseña.`;
}

export function isRecoveryCodeValid(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function validateEmailForAuth(value: string): string | undefined {
  const trimmedEmail = value.trim();
  if (trimmedEmail.length === 0) {
    return 'Escribe tu correo.';
  }

  if (!trimmedEmail.includes('@')) {
    return 'Escribe un correo válido.';
  }

  return undefined;
}

export function validatePasswordForAuth(input: {
  readonly isRecovery: boolean;
  readonly password: string;
}): string | undefined {
  return !input.isRecovery && input.password.length === 0 ? 'Escribe tu contraseña.' : undefined;
}

export function resolveTokenFieldError(input: {
  readonly blockingMessage: string | null;
  readonly normalizedToken: string;
  readonly tokenMessage: string | null;
  readonly tokenTouched: boolean;
}): string | null {
  if (!input.tokenTouched && !input.tokenMessage && !input.blockingMessage) {
    return null;
  }

  return (
    input.blockingMessage ??
    input.tokenMessage ??
    (input.normalizedToken.length > 0 &&
    input.normalizedToken.length < MIN_ACCOUNT_INVITE_TOKEN_LENGTH
      ? 'Pega el código completo para continuar.'
      : null)
  );
}

export function resolveTokenLogoSubtitle(input: {
  readonly blockingMessage: string | null;
  readonly inviterDisplayName?: string | null;
  readonly isFetching: boolean;
}): string {
  if (input.inviterDisplayName && !input.blockingMessage) {
    return `${input.inviterDisplayName} te invitó.`;
  }

  if (input.isFetching) {
    return 'Validando tu invitación.';
  }

  return 'Pega tu código de invitación para continuar.';
}

export function resolveAuthLogoCopy(input: {
  readonly accountDisplayName?: string | null;
  readonly isOtherAccountMode: boolean;
  readonly isRecovery: boolean;
  readonly recoveryLinkSent: boolean;
  readonly showAuthOptions: boolean;
}): {
  readonly subtitle: string;
  readonly title: string;
} {
  if (input.isRecovery) {
    return input.recoveryLinkSent
      ? {
          subtitle: 'Si existe la cuenta, el enlace va en camino.',
          title: 'Revisa tu correo',
        }
      : {
          subtitle: 'Te enviaremos un enlace a tu correo.',
          title: 'Recupera tu contraseña',
        };
  }

  if (!input.showAuthOptions && input.accountDisplayName) {
    return {
      subtitle: 'Toca para continuar.',
      title: `Hola, ${input.accountDisplayName}`,
    };
  }

  return {
    subtitle: input.isOtherAccountMode
      ? 'Usa otra cuenta para continuar.'
      : 'Elige tu método de ingreso.',
    title: 'Ingresa a Happy Circles',
  };
}

export function resolveSecondaryAuthAction(input: {
  readonly hasRememberedAccount: boolean;
  readonly isOtherAccountMode: boolean;
  readonly isRecovery: boolean;
}): {
  readonly icon: 'key-outline' | 'person-circle-outline';
  readonly intent: 'exit_to_invite' | 'show_other_account' | 'show_sign_in';
  readonly label: string;
} {
  if (input.hasRememberedAccount && !input.isRecovery) {
    return input.isOtherAccountMode
      ? {
          icon: 'key-outline',
          intent: 'exit_to_invite',
          label: 'Crear cuenta',
        }
      : {
          icon: 'person-circle-outline',
          intent: 'show_other_account',
          label: 'Usar otra cuenta',
        };
  }

  if (input.isRecovery) {
    return {
      icon: 'person-circle-outline',
      intent: 'show_sign_in',
      label: 'Iniciar sesión',
    };
  }

  return {
    icon: 'key-outline',
    intent: 'exit_to_invite',
    label: 'Volver a invitación',
  };
}

export function resolveAccountInviteEntryParams(input: {
  readonly hasRememberedAccount: boolean;
  readonly isDev: boolean;
  readonly rawModeParam?: string;
  readonly rawPreviewParam?: string;
  readonly rawTokenParam?: string;
}): {
  readonly autoUseRememberedAccount: boolean;
  readonly initialMode: SignInEntryMode;
  readonly initialSurface: JoinEntrySurface;
  readonly initialToken: string;
  readonly isPreviewMode: boolean;
  readonly isRecoverMode: boolean;
  readonly isSignInMode: boolean;
  readonly isTokenEntryMode: boolean;
} {
  const initialToken = extractAccountInviteToken(input.rawTokenParam);
  const isPreviewMode = input.isDev && input.rawPreviewParam === 'true';
  const isRecoverMode =
    input.rawModeParam === 'recover' || input.rawModeParam === 'forgot-password';
  const isTokenEntryMode = input.rawModeParam === 'token' || input.rawModeParam === 'invite';
  const isSignInMode =
    input.rawModeParam === 'sign-in' || input.rawModeParam === 'login' || isRecoverMode;
  const initialSurface: JoinEntrySurface =
    !isTokenEntryMode && (isSignInMode || (input.hasRememberedAccount && !isPreviewMode))
      ? 'auth'
      : 'token';

  return {
    autoUseRememberedAccount: !isTokenEntryMode && !isSignInMode,
    initialMode: isRecoverMode ? 'recover' : 'sign-in',
    initialSurface,
    initialToken,
    isPreviewMode,
    isRecoverMode,
    isSignInMode,
    isTokenEntryMode,
  };
}
