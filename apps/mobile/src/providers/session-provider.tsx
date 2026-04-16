import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import {
  attachEmailPasswordSchema,
  completeProfileSchema,
  emailPasswordSignInSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registrationSchema,
  type Database,
} from '@happy-circles/shared';

import { getCurrentAppVersion, getCurrentDeviceName, getOrCreateDeviceId } from '@/lib/device-trust';
import { buildPhoneE164, normalizeCallingCode, normalizePhoneDigits } from '@/lib/phone';
import {
  getBiometricSupport,
  authenticateWithBiometrics,
  authenticateWithBiometricsResult,
  type BiometricAuthResult,
} from '@/lib/security';
import { buildEmailAuthRedirect } from '@/lib/auth-redirects';
import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type SessionStatus =
  | 'loading'
  | 'signed_out'
  | 'signed_in_untrusted'
  | 'signed_in_unlocked'
  | 'signed_in_locked';
type AuthMode = 'supabase';
type ProfileCompletionState = 'loading' | 'incomplete' | 'complete';
type DeviceTrustState = 'loading' | 'unknown' | 'pending' | 'trusted' | 'revoked';
type IdentityProvider = 'email' | 'google' | 'apple' | 'phone' | 'unknown';

type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
type TrustedDeviceRow = Database['public']['Tables']['trusted_devices']['Row'];

interface BiometricToggleResult {
  readonly ok: boolean;
  readonly message: string;
}

interface AuthCallbackTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

interface AuthIdentity {
  readonly provider?: string | null;
}

interface LinkedMethods {
  readonly hasEmailPassword: boolean;
  readonly hasGoogle: boolean;
  readonly hasApple: boolean;
  readonly hasPhone: boolean;
  readonly providers: readonly string[];
}

interface EmailPasswordCredentials {
  readonly email: string;
  readonly password: string;
}

interface RegistrationInput extends EmailPasswordCredentials {
  readonly fullName: string;
  readonly confirmPassword: string;
  readonly phoneCountryIso2: string;
  readonly phoneCountryCallingCode: string;
  readonly phoneNationalNumber: string;
}

interface CompleteProfileInput {
  readonly fullName: string;
  readonly phoneCountryIso2: string;
  readonly phoneCountryCallingCode: string;
  readonly phoneNationalNumber: string;
}

interface AttachEmailPasswordInput {
  readonly password: string;
  readonly confirmPassword: string;
}

interface PasswordResetInput {
  readonly password: string;
  readonly confirmPassword: string;
}

interface TrustCurrentDeviceInput {
  readonly password?: string;
}

interface SessionContextValue {
  readonly authMode: AuthMode;
  readonly status: SessionStatus;
  readonly userId: string | null;
  readonly email: string | null;
  readonly authProvider: IdentityProvider | null;
  readonly profile: UserProfileRow | null;
  readonly linkedMethods: LinkedMethods;
  readonly profileCompletionState: ProfileCompletionState;
  readonly deviceTrustState: DeviceTrustState;
  readonly trustedDevices: readonly TrustedDeviceRow[];
  readonly currentDeviceId: string | null;
  readonly stepUpFreshUntil: number | null;
  readonly biometricsEnabled: boolean;
  readonly notificationsEnabled: boolean;
  readonly biometricLabel: string;
  readonly biometricAvailable: boolean;
  readonly appleSignInAvailable: boolean;
  readonly isSignedIn: boolean;
  readonly isLocked: boolean;
  readonly isTrustedDevice: boolean;
  readonly requiresProfileCompletion: boolean;
  requestPasswordReset(email: string): Promise<string>;
  updatePassword(input: PasswordResetInput): Promise<string>;
  signInWithPassword(input: EmailPasswordCredentials): Promise<string>;
  registerAccount(input: RegistrationInput): Promise<string>;
  signInWithGoogle(): Promise<string>;
  signInWithApple(): Promise<string>;
  completeProfile(input: CompleteProfileInput): Promise<string>;
  linkGoogle(): Promise<string>;
  linkApple(): Promise<string>;
  attachEmailPassword(input: AttachEmailPasswordInput): Promise<string>;
  trustCurrentDevice(input?: TrustCurrentDeviceInput): Promise<string>;
  revokeTrustedDevice(deviceId: string): Promise<string>;
  refreshAccountState(): Promise<void>;
  signOut(): Promise<void>;
  unlock(): Promise<BiometricAuthResult>;
  lock(): void;
  stepUpAuth(force?: boolean): Promise<BiometricAuthResult>;
  setBiometricsEnabled(enabled: boolean): Promise<BiometricToggleResult>;
  setNotificationsEnabled(enabled: boolean): Promise<void>;
}

const BIOMETRICS_KEY = 'happy_circles.biometrics_enabled';
const NOTIFICATIONS_KEY = 'happy_circles.notifications_enabled';
const LOCK_AFTER_MS = 5 * 60 * 1000;
const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
const EMPTY_LINKED_METHODS: LinkedMethods = {
  hasEmailPassword: false,
  hasGoogle: false,
  hasApple: false,
  hasPhone: false,
  providers: [],
};

const SessionContext = createContext<SessionContextValue | null>(null);

function extractAuthCallbackTokens(url: string): AuthCallbackTokens | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

function extractAuthCallbackCode(url: string): string | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return null;
  }

  const query = url.slice(queryIndex + 1).split('#')[0];
  const params = new URLSearchParams(query);
  const code = params.get('code');

  return code && code.length > 0 ? code : null;
}

function generateSecureNonce(length = 32): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const randomValues = new Uint8Array(length);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
}

function formatValidationMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { readonly issues?: unknown }).issues)
  ) {
    const firstIssue = (error as { readonly issues: Array<{ readonly message?: string }> })
      .issues[0];
    return firstIssue?.message ?? 'Revisa los datos e intenta otra vez.';
  }

  return error instanceof Error ? error.message : 'No se pudo completar la accion.';
}

function formatSupabaseAuthErrorMessage(message: string): string {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (
    normalized.includes('email rate limit exceeded') ||
    normalized.includes('over_email_send_rate_limit')
  ) {
    return 'Supabase bloqueo temporalmente el envio de correos por exceso de intentos. Espera antes de volver a probar o revisa los limites de Auth y tu proveedor SMTP.';
  }

  if (
    normalized.includes('error sending recovery email') ||
    normalized.includes('error sending confirmation email')
  ) {
    return 'Supabase no pudo enviar el correo. Revisa en Supabase que Email use el SMTP de Resend, que el remitente pertenezca a un dominio verificado y que las URLs permitidas incluyan happycircles://reset-password y happycircles://home.';
  }

  if (
    normalized.includes('duplicate key value violates unique constraint') &&
    normalized.includes('user_profiles_phone_e164_unique_idx')
  ) {
    return 'Ese celular ya esta vinculado a otra cuenta.';
  }

  return message;
}

function buildAppleFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null | undefined,
): string | null {
  if (!fullName) {
    return null;
  }

  const normalized = [
    fullName.givenName?.trim(),
    fullName.middleName?.trim(),
    fullName.familyName?.trim(),
  ].filter((part): part is string => Boolean(part));

  if (normalized.length === 0) {
    return null;
  }

  return normalized.join(' ');
}

function normalizeIdentityProvider(value: string | null | undefined): IdentityProvider {
  const normalized = value?.trim().toLocaleLowerCase('en-US');

  if (normalized === 'email') {
    return 'email';
  }

  if (normalized === 'google') {
    return 'google';
  }

  if (normalized === 'apple') {
    return 'apple';
  }

  if (normalized === 'phone') {
    return 'phone';
  }

  return normalized ? 'unknown' : 'unknown';
}

function isLowQualityDisplayName(
  displayName: string | null | undefined,
): boolean {
  const normalized = displayName?.trim() ?? '';
  if (normalized.length < 3) {
    return true;
  }

  return normalized.includes('@');
}

function deriveProfileCompletionState(profile: UserProfileRow | null): ProfileCompletionState {
  if (!profile) {
    return 'loading';
  }

  if (
    isLowQualityDisplayName(profile.display_name) ||
    !profile.phone_e164 ||
    !profile.avatar_path
  ) {
    return 'incomplete';
  }

  return 'complete';
}

function deriveDeviceTrustState(row: TrustedDeviceRow | null): DeviceTrustState {
  if (!row) {
    return 'unknown';
  }

  if (row.trust_state === 'trusted') {
    return 'trusted';
  }

  if (row.trust_state === 'revoked') {
    return 'revoked';
  }

  return 'pending';
}

function deriveLinkedMethods(input: {
  readonly session: Session | null;
  readonly profile: UserProfileRow | null;
  readonly identities: readonly AuthIdentity[];
}): LinkedMethods {
  const providerSet = new Set<string>();
  const user = input.session?.user as
    | {
        readonly app_metadata?: {
          readonly provider?: string | null;
          readonly providers?: readonly string[] | null;
        };
        readonly identities?: readonly AuthIdentity[] | null;
      }
    | undefined;

  for (const identity of input.identities) {
    const provider = identity.provider?.trim().toLocaleLowerCase('en-US');
    if (provider) {
      providerSet.add(provider);
    }
  }

  for (const identity of user?.identities ?? []) {
    const provider = identity.provider?.trim().toLocaleLowerCase('en-US');
    if (provider) {
      providerSet.add(provider);
    }
  }

  for (const provider of user?.app_metadata?.providers ?? []) {
    const normalized = provider?.trim().toLocaleLowerCase('en-US');
    if (normalized) {
      providerSet.add(normalized);
    }
  }

  const primaryProvider = user?.app_metadata?.provider?.trim().toLocaleLowerCase('en-US');
  if (primaryProvider) {
    providerSet.add(primaryProvider);
  }

  const providers = [...providerSet];

  return {
    hasEmailPassword: providers.includes('email'),
    hasGoogle: providers.includes('google'),
    hasApple: providers.includes('apple'),
    hasPhone: Boolean(input.profile?.phone_e164),
    providers,
  };
}

function resolveStatusAfterAccountLoad(input: {
  readonly hasSession: boolean;
  readonly biometricsEnabled: boolean;
  readonly deviceTrustState: DeviceTrustState;
  readonly initialLock: boolean;
  readonly preserveLocked: boolean;
}): SessionStatus {
  if (!input.hasSession) {
    return 'signed_out';
  }

  if (input.deviceTrustState !== 'trusted') {
    return 'signed_in_untrusted';
  }

  if (input.biometricsEnabled && (input.initialLock || input.preserveLocked)) {
    return 'signed_in_locked';
  }

  return 'signed_in_unlocked';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatStepUpErrorMessage(
  actionLabel: string,
  biometricLabel: string,
  error: string | null,
): string {
  if (error === 'device_untrusted') {
    return 'Este dispositivo aun no es confiable. Validalo primero desde Perfil.';
  }

  if (error === 'not_available' || error === 'not_enrolled' || error === 'passcode_not_set') {
    return `Este dispositivo no puede usar ${biometricLabel} para ${actionLabel}.`;
  }

  if (error === 'lockout') {
    return `${biometricLabel} esta bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`;
  }

  if (error === 'user_cancel') {
    return `Cancelaste ${biometricLabel}.`;
  }

  if (error === 'authentication_failed') {
    return `No se pudo validar ${biometricLabel} para ${actionLabel}.`;
  }

  return `No se pudo validar tu identidad para ${actionLabel}.`;
}

async function resolveUserIdentities(currentSession: Session): Promise<readonly AuthIdentity[]> {
  if (!supabase) {
    return [];
  }

  const authApi = supabase.auth as unknown as {
    readonly getUserIdentities?: () => Promise<{
      data?: { identities?: readonly AuthIdentity[] | null };
    }>;
  };

  if (typeof authApi.getUserIdentities === 'function') {
    try {
      const result = await authApi.getUserIdentities();
      return result.data?.identities ?? [];
    } catch {
      return [];
    }
  }

  const user = currentSession.user as { readonly identities?: readonly AuthIdentity[] | null };
  return user.identities ?? [];
}

export function SessionProvider({ children }: PropsWithChildren) {
  const authMode: AuthMode = 'supabase';

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [linkedMethods, setLinkedMethods] = useState<LinkedMethods>(EMPTY_LINKED_METHODS);
  const [profileCompletionState, setProfileCompletionState] =
    useState<ProfileCompletionState>('loading');
  const [deviceTrustState, setDeviceTrustState] = useState<DeviceTrustState>('loading');
  const [trustedDevices, setTrustedDevices] = useState<readonly TrustedDeviceRow[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<IdentityProvider | null>(null);
  const [stepUpFreshUntil, setStepUpFreshUntil] = useState<number | null>(null);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biometria');
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const backgroundedAtRef = useRef<number | null>(null);
  const accountLoadIdRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);

  const clearSignedInState = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setProfile(null);
    setLinkedMethods(EMPTY_LINKED_METHODS);
    setProfileCompletionState('loading');
    setDeviceTrustState('unknown');
    setTrustedDevices([]);
    setCurrentDeviceId(null);
    setAuthProvider(null);
    setStepUpFreshUntil(null);
  }, []);

  const applySessionFromUrl = useCallback(async (url: string | null) => {
    if (!supabase || !url) {
      return;
    }

    const authCode = extractAuthCallbackCode(url);
    if (authCode) {
      const { error } = await supabase.auth.exchangeCodeForSession(authCode);

      if (error) {
        console.warn(
          'Failed to exchange Supabase auth code from auth callback',
          error instanceof Error ? error.message : String(error),
        );
      }

      return;
    }

    const tokens = extractAuthCallbackTokens(url);
    if (!tokens) {
      return;
    }

    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    if (error) {
      console.warn(
        'Failed to restore Supabase session from auth callback',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  const loadAccountState = useCallback(
    async (
      nextSession: Session,
      options: {
        readonly initialLock: boolean;
        readonly preserveLocked: boolean;
        readonly biometricPreference?: boolean;
      },
    ) => {
      if (!supabase) {
        return;
      }

      const loadId = accountLoadIdRef.current + 1;
      accountLoadIdRef.current = loadId;

      setProfileCompletionState('loading');
      setDeviceTrustState('loading');
      setAuthProvider(normalizeIdentityProvider(nextSession.user.app_metadata?.provider ?? null));

      const deviceId = await getOrCreateDeviceId();
      const timestamp = new Date().toISOString();
      const devicePayload = {
        user_id: nextSession.user.id,
        device_id: deviceId,
        platform: Platform.OS,
        device_name: getCurrentDeviceName(),
        app_version: getCurrentAppVersion(),
        last_seen_at: timestamp,
      };

      const [profileResult, identities, maybeDeviceResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select(
            'id, email, display_name, avatar_path, phone_country_iso2, phone_country_calling_code, phone_national_number, phone_e164, phone_verified_at, created_at, updated_at',
          )
          .eq('id', nextSession.user.id)
          .single(),
        resolveUserIdentities(nextSession),
        supabase
          .from('trusted_devices')
          .select('*')
          .eq('user_id', nextSession.user.id)
          .eq('device_id', deviceId)
          .maybeSingle(),
      ]);

      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      if (maybeDeviceResult.error) {
        throw new Error(maybeDeviceResult.error.message);
      }

      let currentDevice: TrustedDeviceRow | null = maybeDeviceResult.data as TrustedDeviceRow | null;
      if (!currentDevice) {
        const insertResult = await supabase
          .from('trusted_devices')
          .insert({
            ...devicePayload,
            trust_state: 'pending',
          } as never)
          .select('*')
          .single();

        if (insertResult.error) {
          throw new Error(insertResult.error.message);
        }

        currentDevice = insertResult.data;
      } else {
        const updateResult = await supabase
          .from('trusted_devices')
          .update(devicePayload as never)
          .eq('id', currentDevice.id)
          .select('*')
          .single();

        if (updateResult.error) {
          throw new Error(updateResult.error.message);
        }

        currentDevice = updateResult.data;
      }

      const devicesResult = await supabase
        .from('trusted_devices')
        .select('*')
        .eq('user_id', nextSession.user.id)
        .order('created_at', { ascending: false });

      if (devicesResult.error) {
        throw new Error(devicesResult.error.message);
      }

      if (loadId !== accountLoadIdRef.current) {
        return;
      }

      const nextProfile = profileResult.data;
      const nextLinkedMethods = deriveLinkedMethods({
        session: nextSession,
        profile: nextProfile,
        identities,
      });
      const nextDeviceTrustState = deriveDeviceTrustState(currentDevice);

      sessionRef.current = nextSession;
      setSession(nextSession);
      setProfile(nextProfile);
      setLinkedMethods(nextLinkedMethods);
      setProfileCompletionState(deriveProfileCompletionState(nextProfile));
      setDeviceTrustState(nextDeviceTrustState);
      setTrustedDevices(devicesResult.data ?? []);
      setCurrentDeviceId(deviceId);
      setStatus(
        resolveStatusAfterAccountLoad({
          hasSession: true,
          biometricsEnabled: options.biometricPreference ?? biometricsEnabled,
          deviceTrustState: nextDeviceTrustState,
          initialLock: options.initialLock,
          preserveLocked: options.preserveLocked,
        }),
      );
    },
    [biometricsEnabled],
  );

  const refreshAccountState = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { data } = await supabase.auth.getSession();
    const nextSession = data.session;

    if (!nextSession) {
      clearSignedInState();
      setStatus('signed_out');
      return;
    }

    await loadAccountState(nextSession, {
      initialLock: false,
      preserveLocked: status === 'signed_in_locked',
      biometricPreference: biometricsEnabled,
    });
  }, [biometricsEnabled, clearSignedInState, loadAccountState, status]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const [biometricValue, notificationValue, support, appleAvailable] = await Promise.all([
        getStoredItem(BIOMETRICS_KEY),
        getStoredItem(NOTIFICATIONS_KEY),
        getBiometricSupport(),
        Platform.OS === 'ios'
          ? AppleAuthentication.isAvailableAsync().catch(() => false)
          : Promise.resolve(false),
      ]);

      if (!active) {
        return;
      }

      const nextBiometricsEnabled = biometricValue === 'true';
      const nextNotificationsEnabled = notificationValue === 'true';

      setBiometricsEnabledState(nextBiometricsEnabled);
      setNotificationsEnabledState(nextNotificationsEnabled);
      setBiometricAvailable(support.available);
      setBiometricLabel(support.label);
      setAppleSignInAvailable(appleAvailable);

      if (!supabase) {
        clearSignedInState();
        setStatus('signed_out');
        setHydrated(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      const nextSession = data.session;
      if (!nextSession) {
        clearSignedInState();
        setStatus('signed_out');
        setHydrated(true);
        return;
      }

      try {
        await loadAccountState(nextSession, {
          initialLock: nextBiometricsEnabled,
          preserveLocked: false,
          biometricPreference: nextBiometricsEnabled,
        });
      } catch (error) {
        console.warn(
          'Failed to hydrate account state',
          error instanceof Error ? error.message : String(error),
        );
        clearSignedInState();
        setStatus('signed_out');
      }

      if (active) {
        setHydrated(true);
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, [clearSignedInState, loadAccountState]);

  useEffect(() => {
    if (!supabase || !hydrated) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession) {
        clearSignedInState();
        setStatus('signed_out');
        return;
      }

      void loadAccountState(nextSession, {
        initialLock: false,
        preserveLocked: event !== 'SIGNED_IN' && status === 'signed_in_locked',
        biometricPreference: biometricsEnabled,
      }).catch((error) => {
        console.warn(
          'Failed to refresh account state after auth change',
          error instanceof Error ? error.message : String(error),
        );
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [biometricsEnabled, clearSignedInState, hydrated, loadAccountState, status]);

  useEffect(() => {
    if (!supabase || !hydrated) {
      return;
    }

    void Linking.getInitialURL().then((url) => applySessionFromUrl(url));

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void applySessionFromUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [applySessionFromUrl, hydrated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        backgroundedAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active') {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;

        if (
          biometricsEnabled &&
          status === 'signed_in_unlocked' &&
          backgroundedAt &&
          Date.now() - backgroundedAt >= LOCK_AFTER_MS
        ) {
          setStatus('signed_in_locked');
          setStepUpFreshUntil(null);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [biometricsEnabled, status]);

  const performGoogleOAuthFlow = useCallback(
    async (mode: 'sign-in' | 'link'): Promise<string> => {
      if (!supabase) {
        return 'Supabase no esta configurado en esta app.';
      }

      const redirectTo = Linking.createURL('/sign-in');
      const authApi = supabase.auth as unknown as {
        readonly linkIdentity?: (input: {
          readonly provider: 'google';
          readonly options?: {
            readonly redirectTo?: string;
            readonly queryParams?: Record<string, string>;
          };
        }) => Promise<{ data?: { url?: string | null }; error?: { message: string } | null }>;
      };

      const authResult =
        mode === 'link' && typeof authApi.linkIdentity === 'function'
          ? await authApi.linkIdentity({
              provider: 'google',
              options: {
                redirectTo,
                queryParams: {
                  prompt: 'select_account',
                },
              },
            })
          : await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
                queryParams: {
                  prompt: 'select_account',
                },
              },
            });

      if (authResult.error) {
        return formatSupabaseAuthErrorMessage(authResult.error.message);
      }

      if (!authResult.data?.url) {
        return mode === 'link' ? 'No se pudo abrir Google para vincularlo.' : 'No se pudo iniciar Google.';
      }

      const result = await WebBrowser.openAuthSessionAsync(authResult.data.url, redirectTo);
      const resultType = String(result.type);

      if (resultType === 'cancel' || resultType === 'dismiss') {
        return mode === 'link' ? 'Vinculacion con Google cancelada.' : 'Inicio con Google cancelado.';
      }

      if (resultType === 'success') {
        const redirectUrl =
          'url' in result && typeof result.url === 'string' ? result.url : null;
        await applySessionFromUrl(redirectUrl);
        return mode === 'link' ? 'Google vinculado.' : 'Sesion iniciada.';
      }

      return mode === 'link'
        ? 'No se pudo completar la vinculacion con Google.'
        : 'No se pudo completar el inicio con Google.';
    },
    [applySessionFromUrl],
  );

  const performAppleAuth = useCallback(
    async (
      mode: 'sign-in' | 'link',
    ): Promise<{ readonly message: string; readonly userId: string | null }> => {
      if (Platform.OS !== 'ios') {
        return {
          message: 'Apple solo esta disponible en iPhone.',
          userId: null,
        };
      }

      if (!supabase) {
        return {
          message: 'Supabase no esta configurado en esta app.',
          userId: null,
        };
      }

      const available = await AppleAuthentication.isAvailableAsync().catch(() => false);
      if (!available) {
        return {
          message: 'Apple no esta disponible en este dispositivo.',
          userId: null,
        };
      }

      try {
        const nonce = generateSecureNonce();
        const credential = await AppleAuthentication.signInAsync({
          nonce,
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          return {
            message: 'Apple no devolvio un token valido.',
            userId: null,
          };
        }

        if (mode === 'link') {
          const authApi = supabase.auth as unknown as {
            readonly linkIdentity?: (input: {
              readonly provider: 'apple';
              readonly token: string;
              readonly nonce: string;
            }) => Promise<{ error?: { message: string } | null }>;
          };

          if (typeof authApi.linkIdentity !== 'function') {
            return {
              message: 'Esta version de Supabase no expone linkIdentity para Apple.',
              userId: null,
            };
          }

          const { error } = await authApi.linkIdentity({
            provider: 'apple',
            token: credential.identityToken,
            nonce,
          });

          if (error) {
            return {
              message: formatSupabaseAuthErrorMessage(error.message),
              userId: null,
            };
          }
        } else {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
            nonce,
          });

          if (error) {
            return {
              message: formatSupabaseAuthErrorMessage(error.message),
              userId: null,
            };
          }
        }

        const fullName = buildAppleFullName(credential.fullName);
        if (fullName) {
          const { error: metadataError } = await supabase.auth.updateUser({
            data: {
              display_name: fullName,
              full_name: fullName,
              given_name: credential.fullName?.givenName?.trim() ?? null,
              family_name: credential.fullName?.familyName?.trim() ?? null,
            },
          });

          if (metadataError) {
            console.warn(
              'Failed to persist Apple full name metadata',
              metadataError instanceof Error ? metadataError.message : String(metadataError),
            );
          }
        }

        const { data } = await supabase.auth.getSession();
        return {
          message: mode === 'link' ? 'Apple vinculado.' : 'Sesion iniciada.',
          userId: data.session?.user.id ?? null,
        };
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { readonly code?: string }).code === 'ERR_REQUEST_CANCELED'
        ) {
          return {
            message: mode === 'link' ? 'Vinculacion con Apple cancelada.' : 'Inicio con Apple cancelado.',
            userId: null,
          };
        }

        return {
          message: formatValidationMessage(error),
          userId: null,
        };
      }
    },
    [],
  );

  const signInWithPassword = useCallback(async (input: EmailPasswordCredentials) => {
    try {
      const parsed = emailPasswordSignInSchema.parse(input);
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');

      if (!supabase) {
        return 'Supabase no esta configurado en esta app.';
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: parsed.password,
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      return 'Sesion iniciada.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, []);

  const registerAccount = useCallback(async (input: RegistrationInput) => {
    try {
      const parsed = registrationSchema.parse(input);
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');
      const phoneCountryCallingCode = normalizeCallingCode(parsed.phoneCountryCallingCode);
      const phoneNationalNumber = normalizePhoneDigits(parsed.phoneNationalNumber);
      const phoneE164 = buildPhoneE164(phoneCountryCallingCode, phoneNationalNumber);

      if (!supabase) {
        return 'Supabase no esta configurado en esta app.';
      }

      const redirectTo = buildEmailAuthRedirect('/home');
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: parsed.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            display_name: parsed.fullName.trim(),
            phone_country_iso2: parsed.phoneCountryIso2.trim().toUpperCase(),
            phone_country_calling_code: phoneCountryCallingCode,
            phone_national_number: phoneNationalNumber,
            phone_e164: phoneE164,
          },
        },
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      if (data.session) {
        return 'Cuenta creada. Ya puedes empezar a usar Happy Circles.';
      }

      return 'Cuenta creada. Revisa tu correo para confirmar y luego entra con tu clave.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => performGoogleOAuthFlow('sign-in'), [
    performGoogleOAuthFlow,
  ]);

  const signInWithApple = useCallback(async () => {
    const result = await performAppleAuth('sign-in');
    return result.message;
  }, [performAppleAuth]);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const parsed = passwordResetRequestSchema.parse({ email });
      const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');

      if (!supabase) {
        return 'Supabase no esta configurado en esta app.';
      }

      const redirectTo = buildEmailAuthRedirect('/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      return 'Si el correo existe, enviamos un enlace para restablecer la clave.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, []);

  const updatePassword = useCallback(async (input: PasswordResetInput) => {
    try {
      const parsed = passwordResetSchema.parse(input);

      if (!supabase || !sessionRef.current) {
        return 'El enlace de recuperacion ya no es valido. Pide uno nuevo.';
      }

      const { error } = await supabase.auth.updateUser({
        password: parsed.password,
      });

      if (error) {
        return formatSupabaseAuthErrorMessage(error.message);
      }

      await refreshAccountState();
      return 'Clave actualizada.';
    } catch (error) {
      return formatValidationMessage(error);
    }
  }, [refreshAccountState]);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }

    clearSignedInState();
    setStatus('signed_out');
  }, [clearSignedInState]);

  const stepUpAuth = useCallback(
    async (force = false): Promise<BiometricAuthResult> => {
      if (deviceTrustState !== 'trusted') {
        return {
          success: false,
          error: 'device_untrusted',
        };
      }

      if (!force && stepUpFreshUntil && stepUpFreshUntil > Date.now()) {
        return {
          success: true,
          error: null,
        };
      }

      let result = await authenticateWithBiometricsResult();

      if (!result.success && (result.error === 'app_cancel' || result.error === 'system_cancel')) {
        await wait(250);
        result = await authenticateWithBiometricsResult();
      }

      if (result.success) {
        setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
        if (status === 'signed_in_locked') {
          setStatus('signed_in_unlocked');
        }
      }

      return result;
    },
    [deviceTrustState, status, stepUpFreshUntil],
  );

  const unlock = useCallback(async (): Promise<BiometricAuthResult> => {
    if (status === 'signed_in_untrusted') {
      return {
        success: false,
        error: 'device_untrusted',
      };
    }

    if (!biometricsEnabled) {
      setStatus('signed_in_unlocked');
      return {
        success: true,
        error: null,
      };
    }

    const result = await authenticateWithBiometricsResult();
    if (result.success) {
      setStatus('signed_in_unlocked');
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);
    }

    return result;
  }, [biometricsEnabled, status]);

  const lock = useCallback(() => {
    if (status === 'signed_in_unlocked') {
      setStatus('signed_in_locked');
      setStepUpFreshUntil(null);
    }
  }, [status]);

  const setBiometricsEnabled = useCallback(
    async (enabled: boolean): Promise<BiometricToggleResult> => {
      if (!enabled) {
        if (biometricsEnabled) {
          const result = await stepUpAuth(true);
          if (!result.success) {
            return {
              ok: false,
              message: 'No se pudo validar tu identidad para desactivar la biometria.',
            };
          }
        }

        await removeStoredItem(BIOMETRICS_KEY);
        setBiometricsEnabledState(false);
        setStepUpFreshUntil(null);

        if (sessionRef.current && deviceTrustState === 'trusted') {
          setStatus('signed_in_unlocked');
        }

        return {
          ok: true,
          message: 'Ingreso con biometria desactivado.',
        };
      }

      const support = await getBiometricSupport();
      setBiometricAvailable(support.available);
      setBiometricLabel(support.label);

      if (!support.available) {
        return {
          ok: false,
          message: 'Este dispositivo no tiene biometria disponible.',
        };
      }

      const authenticated = await authenticateWithBiometrics();
      if (!authenticated) {
        return {
          ok: false,
          message: 'No se pudo confirmar la biometria.',
        };
      }

      await setStoredItem(BIOMETRICS_KEY, 'true');
      setBiometricsEnabledState(true);
      setStepUpFreshUntil(Date.now() + STEP_UP_WINDOW_MS);

      return {
        ok: true,
        message: `Happy Circles pedira ${support.label} al abrirse y volvera a entrar apenas se valide.`,
      };
    },
    [biometricsEnabled, deviceTrustState, stepUpAuth],
  );

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    setNotificationsEnabledState(enabled);

    if (enabled) {
      await setStoredItem(NOTIFICATIONS_KEY, 'true');
      return;
    }

    await removeStoredItem(NOTIFICATIONS_KEY);
  }, []);

  const completeProfile = useCallback(
    async (input: CompleteProfileInput) => {
      try {
        const parsed = completeProfileSchema.parse(input);
        const normalizedDisplayName = parsed.fullName.trim();
        const phoneCountryCallingCode = normalizeCallingCode(parsed.phoneCountryCallingCode);
        const phoneNationalNumber = normalizePhoneDigits(parsed.phoneNationalNumber);
        const phoneE164 = buildPhoneE164(phoneCountryCallingCode, phoneNationalNumber);

        if (!supabase || !sessionRef.current) {
          return 'No hay una sesion activa.';
        }

        const changingProtectedProfileData =
          profileCompletionState === 'complete' &&
          profile?.phone_e164 &&
          profile.phone_e164 !== phoneE164;

        if (changingProtectedProfileData && deviceTrustState !== 'trusted') {
          return 'Confiar este dispositivo es obligatorio antes de cambiar el celular.';
        }

        if (changingProtectedProfileData) {
          const result = await stepUpAuth(true);
          if (!result.success) {
            return formatStepUpErrorMessage('cambiar el perfil', biometricLabel, result.error);
          }
        }

        const updatePayload = {
          display_name: normalizedDisplayName,
          phone_country_iso2: parsed.phoneCountryIso2.trim().toUpperCase(),
          phone_country_calling_code: phoneCountryCallingCode,
          phone_national_number: phoneNationalNumber,
          phone_e164: phoneE164,
        };

        const { error } = await supabase
          .from('user_profiles')
          .update(updatePayload as never)
          .eq('id', sessionRef.current.user.id);

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        const { error: metadataError } = await supabase.auth.updateUser({
          data: updatePayload,
        });

        if (metadataError) {
          console.warn(
            'Failed to mirror profile metadata into auth user',
            metadataError instanceof Error ? metadataError.message : String(metadataError),
          );
        }

        await refreshAccountState();
        return 'Perfil actualizado.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [biometricLabel, deviceTrustState, profile, profileCompletionState, refreshAccountState, stepUpAuth],
  );

  const linkGoogle = useCallback(async () => {
    if (deviceTrustState !== 'trusted') {
      return 'Solo puedes vincular Google desde un dispositivo confiable.';
    }

    const authResult = await stepUpAuth(true);
    if (!authResult.success) {
      return formatStepUpErrorMessage('vincular Google', biometricLabel, authResult.error);
    }

    const oauthResult = await performGoogleOAuthFlow('link');
    if (oauthResult === 'Google vinculado.') {
      await refreshAccountState();
    }

    return oauthResult;
  }, [biometricLabel, deviceTrustState, performGoogleOAuthFlow, refreshAccountState, stepUpAuth]);

  const linkApple = useCallback(async () => {
    if (deviceTrustState !== 'trusted') {
      return 'Solo puedes vincular Apple desde un dispositivo confiable.';
    }

    const authResult = await stepUpAuth(true);
    if (!authResult.success) {
      return formatStepUpErrorMessage('vincular Apple', biometricLabel, authResult.error);
    }

    const appleResult = await performAppleAuth('link');
    if (appleResult.message === 'Apple vinculado.') {
      await refreshAccountState();
    }

    return appleResult.message;
  }, [biometricLabel, deviceTrustState, performAppleAuth, refreshAccountState, stepUpAuth]);

  const attachEmailPassword = useCallback(
    async (input: AttachEmailPasswordInput) => {
      try {
        const parsed = attachEmailPasswordSchema.parse(input);

        if (!supabase || !sessionRef.current) {
          return 'No hay una sesion activa.';
        }

        if (!sessionRef.current.user.email) {
          return 'Esta cuenta no tiene un correo disponible para adjuntar clave.';
        }

        if (deviceTrustState !== 'trusted') {
          return 'Solo puedes agregar clave desde un dispositivo confiable.';
        }

        const result = await stepUpAuth(true);
        if (!result.success) {
          return formatStepUpErrorMessage('agregar una clave', biometricLabel, result.error);
        }

        const { error } = await supabase.auth.updateUser({
          password: parsed.password,
        });

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        await refreshAccountState();
        return 'Clave agregada a tu cuenta actual.';
      } catch (error) {
        return formatValidationMessage(error);
      }
    },
    [biometricLabel, deviceTrustState, refreshAccountState, stepUpAuth],
  );

  const trustCurrentDevice = useCallback(
    async (input?: TrustCurrentDeviceInput) => {
      if (!supabase || !sessionRef.current || !currentDeviceId) {
        return 'No hay una sesion activa.';
      }

      if (deviceTrustState === 'trusted') {
        return 'Este dispositivo ya es confiable.';
      }

      const expectedUserId = sessionRef.current.user.id;

      if (linkedMethods.hasEmailPassword) {
        if (!sessionRef.current.user.email) {
          return 'No encontramos un correo para verificar esta cuenta.';
        }

        if (!input?.password) {
          return 'Escribe tu clave actual para confiar este dispositivo.';
        }

        const { error, data } = await supabase.auth.signInWithPassword({
          email: sessionRef.current.user.email,
          password: input.password,
        });

        if (error) {
          return formatSupabaseAuthErrorMessage(error.message);
        }

        if (data.user?.id !== expectedUserId) {
          await supabase.auth.signOut();
          clearSignedInState();
          setStatus('signed_out');
          return 'La validacion abrio otra cuenta. Cerramos la sesion por seguridad.';
        }
      } else if (linkedMethods.hasGoogle) {
        const result = await performGoogleOAuthFlow('sign-in');
        if (result !== 'Sesion iniciada.') {
          return result;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id !== expectedUserId) {
          await supabase.auth.signOut();
          clearSignedInState();
          setStatus('signed_out');
          return 'Google abrio otra cuenta. Cerramos la sesion por seguridad.';
        }
      } else if (linkedMethods.hasApple) {
        const result = await performAppleAuth('sign-in');
        if (result.message !== 'Sesion iniciada.') {
          return result.message;
        }

        if (result.userId !== expectedUserId) {
          await supabase.auth.signOut();
          clearSignedInState();
          setStatus('signed_out');
          return 'Apple abrio otra cuenta. Cerramos la sesion por seguridad.';
        }
      } else {
        return 'Esta cuenta no tiene un metodo disponible para revalidar el dispositivo.';
      }

      const timestamp = new Date().toISOString();
      const updateResult = await supabase
        .from('trusted_devices')
        .update({
          trust_state: 'trusted',
          trusted_at: timestamp,
          revoked_at: null,
          last_seen_at: timestamp,
        } as never)
        .eq('user_id', expectedUserId)
        .eq('device_id', currentDeviceId);

      if (updateResult.error) {
        return updateResult.error.message;
      }

      await refreshAccountState();
      return 'Este dispositivo ahora es confiable.';
    },
    [
      clearSignedInState,
      currentDeviceId,
      deviceTrustState,
      linkedMethods,
      performAppleAuth,
      performGoogleOAuthFlow,
      refreshAccountState,
    ],
  );

  const revokeTrustedDevice = useCallback(
    async (deviceId: string) => {
      if (!supabase || !sessionRef.current) {
        return 'No hay una sesion activa.';
      }

      if (deviceTrustState !== 'trusted') {
        return 'Solo puedes revocar dispositivos desde un dispositivo confiable.';
      }

      const result = await stepUpAuth(true);
      if (!result.success) {
        return formatStepUpErrorMessage('revocar el dispositivo', biometricLabel, result.error);
      }

      const timestamp = new Date().toISOString();
      const { error } = await supabase
        .from('trusted_devices')
        .update({
          trust_state: 'revoked',
          revoked_at: timestamp,
          last_seen_at: timestamp,
        } as never)
        .eq('user_id', sessionRef.current.user.id)
        .eq('device_id', deviceId);

      if (error) {
        return error.message;
      }

      await refreshAccountState();
      return deviceId === currentDeviceId
        ? 'Este dispositivo fue revocado y quedo sin confianza.'
        : 'Dispositivo revocado.';
    },
    [biometricLabel, currentDeviceId, deviceTrustState, refreshAccountState, stepUpAuth],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      authMode,
      status,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      authProvider,
      profile,
      linkedMethods,
      profileCompletionState,
      deviceTrustState,
      trustedDevices,
      currentDeviceId,
      stepUpFreshUntil,
      biometricsEnabled,
      notificationsEnabled,
      biometricLabel,
      biometricAvailable,
      appleSignInAvailable,
      isSignedIn:
        status === 'signed_in_unlocked' ||
        status === 'signed_in_locked' ||
        status === 'signed_in_untrusted',
      isLocked: status === 'signed_in_locked',
      isTrustedDevice: deviceTrustState === 'trusted',
      requiresProfileCompletion: profileCompletionState === 'incomplete',
      requestPasswordReset,
      updatePassword,
      signInWithPassword,
      registerAccount,
      signInWithGoogle,
      signInWithApple,
      completeProfile,
      linkGoogle,
      linkApple,
      attachEmailPassword,
      trustCurrentDevice,
      revokeTrustedDevice,
      refreshAccountState,
      signOut,
      unlock,
      lock,
      stepUpAuth,
      setBiometricsEnabled,
      setNotificationsEnabled,
    }),
    [
      attachEmailPassword,
      authMode,
      authProvider,
      biometricAvailable,
      biometricLabel,
      biometricsEnabled,
      completeProfile,
      currentDeviceId,
      deviceTrustState,
      appleSignInAvailable,
      linkApple,
      linkGoogle,
      linkedMethods,
      lock,
      notificationsEnabled,
      profile,
      profileCompletionState,
      requestPasswordReset,
      refreshAccountState,
      registerAccount,
      revokeTrustedDevice,
      session,
      setBiometricsEnabled,
      setNotificationsEnabled,
      signInWithApple,
      signInWithGoogle,
      signInWithPassword,
      signOut,
      status,
      updatePassword,
      stepUpAuth,
      stepUpFreshUntil,
      trustCurrentDevice,
      trustedDevices,
      unlock,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider.');
  }

  return context;
}
