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

import { useMockData } from '@/lib/config';
import { getBiometricSupport, authenticateWithBiometrics } from '@/lib/security';
import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

type SessionStatus = 'loading' | 'signed_out' | 'signed_in_unlocked' | 'signed_in_locked';
type AuthMode = 'demo' | 'supabase';

interface BiometricToggleResult {
  readonly ok: boolean;
  readonly message: string;
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
  signInWithMagicLink(email: string): Promise<string>;
  signInDemo(): Promise<void>;
  signOut(): Promise<void>;
  unlock(): Promise<boolean>;
  lock(): void;
  setBiometricsEnabled(enabled: boolean): Promise<BiometricToggleResult>;
  setNotificationsEnabled(enabled: boolean): Promise<void>;
}

const BIOMETRICS_KEY = 'happy_circles.biometrics_enabled';
const NOTIFICATIONS_KEY = 'happy_circles.notifications_enabled';
const DEMO_USER_KEY = 'happy_circles.demo_user_email';
const LOCK_AFTER_MS = 5 * 60 * 1000;

const SessionContext = createContext<SessionContextValue | null>(null);

function resolveStatus(hasSession: boolean, biometricsEnabled: boolean): SessionStatus {
  if (!hasSession) {
    return 'signed_out';
  }

  return biometricsEnabled ? 'signed_in_locked' : 'signed_in_unlocked';
}

export function SessionProvider({ children }: PropsWithChildren) {
  const authMode: AuthMode = useMockData || !supabase ? 'demo' : 'supabase';

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biometria');
  const [hydrated, setHydrated] = useState(false);

  const backgroundedAtRef = useRef<number | null>(null);

  const applySessionState = useCallback(
    (hasSession: boolean, nextUserId: string | null, nextEmail: string | null) => {
      setUserId(nextUserId);
      setEmail(nextEmail);
      setStatus(resolveStatus(hasSession, biometricsEnabled));
    },
    [biometricsEnabled],
  );

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

      if (authMode === 'supabase' && supabase) {
        const { data } = await supabase.auth.getSession();
        if (!active) {
          return;
        }

        const nextSession = data.session;
        setUserId(nextSession?.user.id ?? null);
        setEmail(nextSession?.user.email ?? null);
        setStatus(resolveStatus(Boolean(nextSession), nextBiometricsEnabled));
      } else {
        const demoEmail = await getStoredItem(DEMO_USER_KEY);
        if (!active) {
          return;
        }

        setUserId(null);
        setEmail(demoEmail);
        setStatus(resolveStatus(Boolean(demoEmail), nextBiometricsEnabled));
      }

      setHydrated(true);
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, [authMode]);

  useEffect(() => {
    if (authMode !== 'supabase' || !supabase || !hydrated) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession: Session | null) => {
      setUserId(nextSession?.user.id ?? null);
      setEmail(nextSession?.user.email ?? null);
      setStatus(resolveStatus(Boolean(nextSession), biometricsEnabled));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [authMode, biometricsEnabled, hydrated]);

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

  const signInWithMagicLink = useCallback(
    async (nextEmail: string) => {
      const normalizedEmail = nextEmail.trim().toLocaleLowerCase('en-US');
      if (normalizedEmail.length === 0) {
        return 'Ingresa un correo valido.';
      }

      if (!supabase || authMode === 'demo') {
        await setStoredItem(DEMO_USER_KEY, normalizedEmail);
        applySessionState(true, null, normalizedEmail);
        return 'Entraste al modo demo porque no hay Supabase configurado.';
      }

      const redirectTo = Linking.createURL('/home');
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        return error.message;
      }

      return 'Te enviamos un magic link para entrar.';
    },
    [applySessionState, authMode],
  );

  const signInDemo = useCallback(async () => {
    const demoEmail = 'demo@happycircles.app';
    await setStoredItem(DEMO_USER_KEY, demoEmail);
    applySessionState(true, null, demoEmail);
  }, [applySessionState]);

  const signOut = useCallback(async () => {
    if (authMode === 'supabase' && supabase) {
      await supabase.auth.signOut();
    }

    await removeStoredItem(DEMO_USER_KEY);
    setUserId(null);
    setEmail(null);
    setStatus('signed_out');
  }, [authMode]);

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
          message: 'Bloqueo biometrico desactivado.',
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
        message: `Happy Circles se bloqueara con ${support.label} al volver a abrirse.`,
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
      signInWithMagicLink,
      signInDemo,
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
      signInWithMagicLink,
      signInDemo,
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
