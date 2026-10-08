import type { Session } from '@supabase/supabase-js';
import type { BiometricAuthResult } from '@/lib/security';
import type { LinkedMethods, StepUpAuthInput, TrustCurrentDeviceInput } from '../session/types';
import { normalizeStepUpAuthInput } from './session-step-up-input';
import { runAccountReauthentication } from './session-security-actions';
import {
  canReuseStepUpProof,
  isSameAuthSession,
  readAuthSessionIdentity,
  type StepUpProof,
} from './device-session-authorization';
import type { SessionEdgeActionResult } from './session-edge-action';

type AccountMethod = 'password' | 'google' | 'apple';

interface AuthorizationRuntime {
  readonly session: Session | null;
  readonly deviceId: string | null;
  readonly isAuthorized: boolean;
  readonly linkedMethods: LinkedMethods;
  readonly proof: StepUpProof | null;
}

interface SessionAuthorizationInput {
  readonly readRuntime: () => AuthorizationRuntime;
  readonly readSession: () => Promise<Session | null>;
  readonly adoptSession: (session: Session) => void;
  readonly confirm: (
    session: Session,
    deviceId: string,
  ) => Promise<SessionEdgeActionResult<unknown>>;
  readonly refresh: (session: Session) => Promise<void>;
  readonly authenticate: (
    method: AccountMethod,
    password?: string,
  ) => Promise<{
    readonly userId: string | null;
    readonly error?: string;
    readonly message?: string;
  }>;
  readonly authenticateBiometrics: () => Promise<BiometricAuthResult>;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly onAccountMismatch: () => Promise<void>;
  readonly onAuthorizationFailure?: (code?: string) => void;
  readonly onProof: () => void;
  readonly onUnlock: () => void;
  readonly isMounted: () => boolean;
  readonly errorMessage: (error: unknown) => string;
}

const SESSION_CHANGED: BiometricAuthResult = {
  success: false,
  error: 'session_changed',
  message: 'La sesión cambió. Intenta nuevamente desde la cuenta actual.',
};

export function createSessionAuthorizationActions(input: SessionAuthorizationInput) {
  const inFlight = new Map<string, Promise<BiometricAuthResult>>();
  const accountIsCurrent = (userId: string) =>
    input.isMounted() && input.readRuntime().session?.user.id === userId;
  const sessionIsCurrent = (session: Session) =>
    input.isMounted() &&
    isSameAuthSession(
      readAuthSessionIdentity(session),
      readAuthSessionIdentity(input.readRuntime().session),
    );

  async function authorizeCurrentDeviceSession(): Promise<BiometricAuthResult> {
    const runtime = { ...input.readRuntime() };
    const expectedUserId = runtime.session?.user.id;
    if (!expectedUserId || !runtime.deviceId) {
      return { success: false, error: 'session_unavailable', message: 'No hay una sesión activa.' };
    }
    try {
      const session = await input.readSession();
      if (!session || session.user.id !== expectedUserId || !accountIsCurrent(expectedUserId)) {
        return SESSION_CHANGED;
      }
      const identity = readAuthSessionIdentity(session);
      if (!identity) {
        return {
          success: false,
          error: 'session_unavailable',
          message: 'No pudimos identificar la sesión. Vuelve a ingresar.',
        };
      }
      input.adoptSession(session);
      const key = `${identity.userId}:${identity.sessionId}:${runtime.deviceId}`;
      const existing = inFlight.get(key);
      if (existing) return existing;
      const authorization = (async (): Promise<BiometricAuthResult> => {
        const result = await input.confirm(session, runtime.deviceId!);
        if (!sessionIsCurrent(session)) return SESSION_CHANGED;
        if (!result.ok) {
          input.onAuthorizationFailure?.(result.code);
          return {
            success: false,
            error: result.code ?? 'server_validation_failed',
            message: result.message,
          };
        }
        await input.refresh(session);
        if (!sessionIsCurrent(session)) return SESSION_CHANGED;
        if (!input.readRuntime().isAuthorized) {
          return {
            success: false,
            error: 'device_untrusted',
            message: 'No pudimos confirmar esta sesión en el teléfono. Inténtalo de nuevo.',
          };
        }
        // Authorization can be idempotent. It never renews sensitive-action proof.
        return { success: true, error: null };
      })();
      inFlight.set(key, authorization);
      try {
        return await authorization;
      } finally {
        if (inFlight.get(key) === authorization) inFlight.delete(key);
      }
    } catch (error) {
      return {
        success: false,
        error: 'server_validation_failed',
        message: input.errorMessage(error),
      };
    }
  }

  async function reauthenticate(
    method: AccountMethod,
    password?: string,
  ): Promise<BiometricAuthResult> {
    const runtime = { ...input.readRuntime() };
    const userId = runtime.session?.user.id;
    if (!userId) return SESSION_CHANGED;
    if (
      method === 'password' &&
      (!runtime.linkedMethods.hasEmailPassword || !runtime.session?.user.email)
    ) {
      return {
        success: false,
        error: 'password_unavailable',
        message: 'Esta cuenta no tiene contraseña vinculada.',
      };
    }
    if (method === 'password' && !password?.trim()) {
      return {
        success: false,
        error: 'password_required',
        message: 'Escribe tu contraseña actual.',
      };
    }
    if (
      (method === 'google' && !runtime.linkedMethods.hasGoogle) ||
      (method === 'apple' && !runtime.linkedMethods.hasApple)
    ) {
      return {
        success: false,
        error: 'provider_unavailable',
        message: `${method === 'google' ? 'Google' : 'Apple'} no está vinculado a esta cuenta.`,
      };
    }
    const result = await runAccountReauthentication({
      expectedUserId: userId,
      authenticate: () => input.authenticate(method, password),
      onAccountMismatch: input.onAccountMismatch,
    });
    if (!result.success) return result;
    if (!accountIsCurrent(userId)) return SESSION_CHANGED;
    const authorization = await authorizeCurrentDeviceSession();
    if (authorization.success && accountIsCurrent(userId)) {
      input.onProof();
      input.onUnlock();
    }
    return authorization;
  }

  async function stepUpAuth(authInput?: boolean | StepUpAuthInput): Promise<BiometricAuthResult> {
    const options = normalizeStepUpAuthInput(authInput);
    const runtime = { ...input.readRuntime() };
    const method = options.method ?? (options.password !== undefined ? 'password' : 'biometric');
    try {
      if (method !== 'biometric') return await reauthenticate(method, options.password);
      if (!runtime.isAuthorized) return { success: false, error: 'device_untrusted' };
      if (
        !options.force &&
        !options.method &&
        options.password === undefined &&
        canReuseStepUpProof(runtime.proof, runtime.session, Date.now())
      ) {
        return { success: true, error: null };
      }
      if (!runtime.session) return SESSION_CHANGED;
      let result = await input.authenticateBiometrics();
      if (!result.success && (result.error === 'app_cancel' || result.error === 'system_cancel')) {
        await input.wait(250);
        if (!sessionIsCurrent(runtime.session)) return SESSION_CHANGED;
        result = await input.authenticateBiometrics();
      }
      if (!sessionIsCurrent(runtime.session)) return SESSION_CHANGED;
      if (!input.readRuntime().isAuthorized) return { success: false, error: 'device_untrusted' };
      if (result.success) {
        input.onProof();
        input.onUnlock();
      }
      return result;
    } catch (error) {
      return { success: false, error: 'authentication_error', message: input.errorMessage(error) };
    }
  }

  async function trustCurrentDevice(authInput?: TrustCurrentDeviceInput): Promise<string> {
    try {
      const runtime = { ...input.readRuntime() };
      if (authInput?.method && authInput.method !== 'recent_auth') {
        const result = await reauthenticate(authInput.method, authInput.password);
        return result.success
          ? 'Este teléfono ahora es confiable.'
          : (result.message ?? 'No pudimos validar tu identidad. Inténtalo de nuevo.');
      }
      if (runtime.isAuthorized) return 'Este teléfono ya es confiable.';
      const existing = await authorizeCurrentDeviceSession();
      if (existing.success) return 'Este teléfono ahora es confiable.';
      if (existing.error !== 'recent_auth_required' || authInput?.method === 'recent_auth') {
        return existing.message ?? 'No pudimos confirmar este teléfono. Inténtalo de nuevo.';
      }
      const method =
        authInput?.method ??
        (runtime.linkedMethods.hasGoogle
          ? 'google'
          : runtime.linkedMethods.hasApple
            ? 'apple'
            : runtime.linkedMethods.hasEmailPassword
              ? 'password'
              : null);
      if (!method) return 'Esta cuenta no tiene un método disponible para confirmar el teléfono.';
      const result = await reauthenticate(method, authInput?.password);
      return result.success
        ? 'Este teléfono ahora es confiable.'
        : (result.message ?? 'No pudimos validar tu identidad. Inténtalo de nuevo.');
    } catch (error) {
      return input.errorMessage(error);
    }
  }

  return { authorizeCurrentDeviceSession, stepUpAuth, trustCurrentDevice };
}
