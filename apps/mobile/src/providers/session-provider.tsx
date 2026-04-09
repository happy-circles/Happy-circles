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
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';
import { emailPasswordSignInSchema, registrationSchema } from '@happy-circles/shared';

import { buildPhoneE164, normalizeCallingCode, normalizePhoneDigits } from '@/lib/phone';
import { getBiometricSupport, authenticateWithBiometrics } from '@/lib/security';
import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

type SessionStatus = 'loading' | 'signed_out' | 'signed_in_unlocked' | 'signed_in_locked';
type AuthMode = 'supabase';

interface BiometricToggleResult {
  readonly ok: boolean;
  readonly message: string;
}

interface AuthCallbackTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
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

interface SessionContextValue {
  readonly authMode: AuthMode;
  readonly status: SessionStatus;
  readonly userId: string | null;
  readonly email: string | null;
  readonly biometricsEnabled: boolean;
  readonly notificationsEnabled: boolean;
  readonly biometricLabel: string;
  readonly biometricAvailable: boolean;
  readonly isSignedIn: boolean;
  readonly isLocked: boolean;
  signInWithPassword(input: EmailPasswordCredentials): Promise<string>;
  registerAccount(input: RegistrationInput): Promise<string>;
  signOut(): Promise<void>;
  unlock(): Promise<boolean>;
  lock(): void;
  setBiometricsEnabled(enabled: boolean): Promise<BiometricToggleResult>;
  setNotificationsEnabled(enabled: boolean): Promise<void>;
}

const BIOMETRICS_KEY = 'happy_circles.biometrics_enabled';
const NOTIFICATIONS_KEY = 'happy_circles.notifications_enabled';
const LOCK_AFTER_MS = 5 * 60 * 1000;

const SessionContext = createContext<SessionContextValue | null>(null);

function resolveStatus(hasSession: boolean, biometricsEnabled: boolean): SessionStatus {
  if (!hasSession) {
    return 'signed_out';
  }

  return biometricsEnabled ? 'signed_in_locked' : 'signed_in_unlocked';
}

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

  return message;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const authMode: AuthMode = 'supabase';

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biometria');
  const [hydrated, setHydrated] = useState(false);

  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const [biometricValue, notificationValue, support] = await Promise.all([
        getStoredItem(BIOMETRICS_KEY),
        getStoredItem(NOTIFICATIONS_KEY),
        getBiometricSupport(),
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

      if (!supabase) {
        setUserId(null);
        setEmail(null);
        setStatus('signed_out');
        setHydrated(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      const nextSession = data.session;
      setUserId(nextSession?.user.id ?? null);
      setEmail(nextSession?.user.email ?? null);
      setStatus(resolveStatus(Boolean(nextSession), nextBiometricsEnabled));

      setHydrated(true);
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase || !hydrated) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession: Session | null) => {
      setUserId(nextSession?.user.id ?? null);
      setEmail(nextSession?.user.email ?? null);

      if (!nextSession) {
        setStatus('signed_out');
        return;
      }

      setStatus((currentStatus) => {
        if (currentStatus === 'loading') {
          return resolveStatus(true, biometricsEnabled);
        }

        if (currentStatus === 'signed_out' && event === 'SIGNED_IN') {
          return 'signed_in_unlocked';
        }

        return currentStatus === 'signed_in_locked' ? 'signed_in_locked' : 'signed_in_unlocked';
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [biometricsEnabled, hydrated]);

  const applySessionFromUrl = useCallback(async (url: string | null) => {
    if (!supabase || !url) {
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
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [biometricsEnabled, status]);

  const signInWithPassword = useCallback(
    async (input: EmailPasswordCredentials) => {
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
    },
    [],
  );

  const registerAccount = useCallback(
    async (input: RegistrationInput) => {
      try {
        const parsed = registrationSchema.parse(input);
        const normalizedEmail = parsed.email.trim().toLocaleLowerCase('en-US');
        const phoneCountryCallingCode = normalizeCallingCode(parsed.phoneCountryCallingCode);
        const phoneNationalNumber = normalizePhoneDigits(parsed.phoneNationalNumber);
        const phoneE164 = buildPhoneE164(phoneCountryCallingCode, phoneNationalNumber);

        if (!supabase) {
          return 'Supabase no esta configurado en esta app.';
        }

        const redirectTo = Linking.createURL('/home');
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
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUserId(null);
    setEmail(null);
    setStatus('signed_out');
  }, []);

  const unlock = useCallback(async () => {
    if (!biometricsEnabled) {
      setStatus('signed_in_unlocked');
      return true;
    }

    const authenticated = await authenticateWithBiometrics();
    if (authenticated) {
      setStatus('signed_in_unlocked');
    }

    return authenticated;
  }, [biometricsEnabled]);

  const lock = useCallback(() => {
    if (status === 'signed_in_unlocked') {
      setStatus('signed_in_locked');
    }
  }, [status]);

  const setBiometricsEnabled = useCallback(
    async (enabled: boolean): Promise<BiometricToggleResult> => {
      if (!enabled) {
        await removeStoredItem(BIOMETRICS_KEY);
        setBiometricsEnabledState(false);
        if (email) {
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

      return {
        ok: true,
        message: `Happy Circles pedira ${support.label} al abrirse y volvera a entrar apenas se valide.`,
      };
    },
    [email],
  );

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    setNotificationsEnabledState(enabled);

    if (enabled) {
      await setStoredItem(NOTIFICATIONS_KEY, 'true');
      return;
    }

    await removeStoredItem(NOTIFICATIONS_KEY);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      authMode,
      status,
      userId,
      email,
      biometricsEnabled,
      notificationsEnabled,
      biometricLabel,
      biometricAvailable,
      isSignedIn: status === 'signed_in_unlocked' || status === 'signed_in_locked',
      isLocked: status === 'signed_in_locked',
      signInWithPassword,
      registerAccount,
      signOut,
      unlock,
      lock,
      setBiometricsEnabled,
      setNotificationsEnabled,
    }),
    [
      authMode,
      status,
      userId,
      email,
      biometricsEnabled,
      notificationsEnabled,
      biometricLabel,
      biometricAvailable,
      signInWithPassword,
      registerAccount,
      signOut,
      unlock,
      lock,
      setBiometricsEnabled,
      setNotificationsEnabled,
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
