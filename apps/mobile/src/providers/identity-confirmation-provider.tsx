import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';

import { IdentityConfirmationDialog } from '@/components/identity-confirmation-dialog';
import { beginIdentityConfirmationPresentation } from '@/lib/identity-modal-coordination';
import { formatStepUpErrorMessage } from '@/providers/session/step-up';
import {
  SESSION_SOCIAL_AUTH_TIMEOUT_MS,
  sessionOperationErrorMessage,
  withSessionOperationTimeout,
} from '@/providers/session-runtime/session-operation';
import {
  availableIdentityConfirmationMethods,
  canReuseIdentityConfirmation,
  IdentityConfirmationRequests,
  type IdentityConfirmationInput,
  type IdentityConfirmationMethod,
  type IdentityConfirmationRequest,
} from './identity-confirmation-state';
import { useSession } from './session-provider';

export type { IdentityConfirmationInput } from './identity-confirmation-state';

interface IdentityConfirmationContextValue {
  confirmIdentity(this: void, input: IdentityConfirmationInput): Promise<boolean>;
}

const IdentityConfirmationContext = createContext<IdentityConfirmationContextValue | null>(null);

function waitForActiveApp(): Promise<boolean> {
  if (AppState.currentState === 'active') return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (active: boolean) => {
      clearTimeout(timeout);
      subscription.remove();
      resolve(active);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish(true);
    });
    const timeout = setTimeout(() => finish(false), 5_000);
  });
}

export function IdentityConfirmationProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [requests] = useState(() => new IdentityConfirmationRequests());
  const mountedRef = useRef(true);
  const presentationRef = useRef<ReturnType<typeof beginIdentityConfirmationPresentation> | null>(
    null,
  );
  const closingPresentationRef = useRef(false);
  const dialogVisibleRef = useRef(false);
  const operationRef = useRef<{
    readonly requestId: number;
    readonly externalHandoff: boolean;
  } | null>(null);
  const [request, setRequest] = useState<IdentityConfirmationRequest | null>(null);
  const [dialogPresentation, setDialogPresentation] = useState<{
    readonly request: IdentityConfirmationRequest;
    readonly presentation: ReturnType<typeof beginIdentityConfirmationPresentation>;
  } | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [busyMethod, setBusyMethod] = useState<IdentityConfirmationMethod | 'session' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    if (!mountedRef.current) return;
    setRequest(null);
    setDialogVisible(false);
    setBusyMethod(null);
    setPassword('');
    setError(null);
    const presentation = presentationRef.current;
    if (!presentation || closingPresentationRef.current) return;
    if (dialogVisibleRef.current) {
      dialogVisibleRef.current = false;
      closingPresentationRef.current = true;
      void presentation.closing(Platform.OS === 'ios').then(() => {
        if (presentationRef.current === presentation) {
          presentationRef.current = null;
          closingPresentationRef.current = false;
        }
      });
    } else {
      presentation.release();
      presentationRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    requests.cancel();
    closeDialog();
  }, [closeDialog, requests]);

  const finish = useCallback(
    async (pending: IdentityConfirmationRequest, confirmed: boolean) => {
      const active = confirmed ? await waitForActiveApp() : false;
      if (requests.finish(pending, sessionRef.current.userId, confirmed && active)) closeDialog();
    },
    [closeDialog, requests],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requests.cancel();
      presentationRef.current?.release();
      presentationRef.current = null;
    };
  }, [requests]);

  useEffect(() => {
    if (request && request.userId !== session.userId) cancel();
  }, [cancel, request, session.userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && !operationRef.current?.externalHandoff) cancel();
    });
    return () => subscription.remove();
  }, [cancel]);

  const present = useCallback(
    async (pending: IdentityConfirmationRequest): Promise<boolean> => {
      const presentation = beginIdentityConfirmationPresentation();
      presentationRef.current = presentation;
      const ready = await presentation.ready;
      if (
        !ready ||
        !mountedRef.current ||
        !requests.isCurrent(pending, sessionRef.current.userId) ||
        AppState.currentState !== 'active'
      ) {
        presentation.release();
        if (presentationRef.current === presentation) presentationRef.current = null;
        if (requests.finish(pending, sessionRef.current.userId, false)) closeDialog();
        return false;
      }
      setDialogPresentation({ request: pending, presentation });
      dialogVisibleRef.current = true;
      setDialogVisible(true);
      return true;
    },
    [closeDialog, requests],
  );

  const confirmIdentity = useCallback(
    async (input: IdentityConfirmationInput): Promise<boolean> => {
      const current = sessionRef.current;
      if (
        operationRef.current ||
        presentationRef.current ||
        !current.userId ||
        AppState.currentState !== 'active'
      )
        return false;
      const pending = requests.begin(current.userId, input);
      if (!pending) return false;
      if (canReuseIdentityConfirmation(input, current)) {
        requests.finish(pending.request, current.userId, true);
        return pending.promise;
      }

      setPassword('');
      setError(null);
      setRequest(pending.request);
      if (input.purpose === 'device') {
        operationRef.current = { requestId: pending.request.id, externalHandoff: false };
        setBusyMethod('session');
        void (async () => {
          try {
            if (!(await present(pending.request))) return;
            const result = await withSessionOperationTimeout(
              'authorize-device-session',
              current.authorizeCurrentDeviceSession(),
            );
            if (requests.isCurrent(pending.request, sessionRef.current.userId)) {
              if (result.success) await finish(pending.request, true);
              else if (result.error !== 'recent_auth_required')
                setError(result.message ?? 'Confirma con un método de tu cuenta para continuar.');
            }
          } catch (failure) {
            if (requests.isCurrent(pending.request, sessionRef.current.userId)) {
              setError(
                sessionOperationErrorMessage(
                  failure,
                  'No pudimos comprobar esta sesión. Usa un método de tu cuenta.',
                ),
              );
            }
          } finally {
            operationRef.current = null;
            if (mountedRef.current) setBusyMethod(null);
          }
        })();
      } else void present(pending.request);
      return pending.promise;
    },
    [finish, present, requests],
  );

  const methods = availableIdentityConfirmationMethods({
    purpose: request?.input.purpose ?? 'sensitive',
    isAuthorizedDeviceSession: session.isAuthorizedDeviceSession,
    biometricAvailable: session.biometricAvailable,
    hasGoogle: session.linkedMethods.hasGoogle,
    hasApple: session.linkedMethods.hasApple,
    appleSignInAvailable: session.appleSignInAvailable,
    hasPassword: session.linkedMethods.hasEmailPassword,
  });

  async function submit(method: IdentityConfirmationMethod) {
    if (!request || operationRef.current || !methods.includes(method)) return;
    const current = sessionRef.current;
    if (!requests.isCurrent(request, current.userId) || (method === 'password' && !password.trim()))
      return;
    operationRef.current = {
      requestId: request.id,
      externalHandoff: method === 'google' || method === 'apple',
    };
    setBusyMethod(method);
    setError(null);
    try {
      if (request.input.purpose === 'device') {
        if (method === 'biometric') return;
        const result = await withSessionOperationTimeout(
          'confirm-device-session',
          current.trustCurrentDevice({ method, ...(method === 'password' ? { password } : {}) }),
          SESSION_SOCIAL_AUTH_TIMEOUT_MS,
        );
        if (!requests.isCurrent(request, sessionRef.current.userId)) return;
        if (
          result === 'Este teléfono ahora es confiable.' ||
          result === 'Este teléfono ya es confiable.'
        ) {
          await finish(request, true);
        } else setError(result);
      } else {
        const result = await withSessionOperationTimeout(
          'confirm-sensitive-action',
          current.stepUpAuth({
            method,
            force: true,
            ...(method === 'password' ? { password } : {}),
          }),
          SESSION_SOCIAL_AUTH_TIMEOUT_MS,
        );
        if (!requests.isCurrent(request, sessionRef.current.userId)) return;
        if (result.success) await finish(request, true);
        else
          setError(
            result.message ??
              formatStepUpErrorMessage(
                request.input.actionLabel,
                current.biometricLabel,
                result.error,
              ),
          );
      }
    } catch (failure) {
      if (requests.isCurrent(request, sessionRef.current.userId)) {
        setError(
          sessionOperationErrorMessage(
            failure,
            failure instanceof Error
              ? failure.message
              : 'No pudimos confirmar tu identidad. Inténtalo de nuevo.',
          ),
        );
      }
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setBusyMethod(null);
    }
  }

  const value = useMemo(() => ({ confirmIdentity }), [confirmIdentity]);
  return (
    <IdentityConfirmationContext.Provider value={value}>
      {children}
      {dialogPresentation ? (
        <IdentityConfirmationDialog
          key={dialogPresentation.request.id}
          actionLabel={dialogPresentation.request.input.actionLabel}
          biometricLabel={session.biometricLabel}
          busyMethod={busyMethod}
          error={error}
          methods={request ? methods : []}
          onClose={cancel}
          onDismiss={() => dialogPresentation.presentation.release()}
          onPasswordChange={setPassword}
          onSubmit={(method) => void submit(method)}
          password={password}
          visible={dialogVisible}
        />
      ) : null}
    </IdentityConfirmationContext.Provider>
  );
}

export function useIdentityConfirmation(): IdentityConfirmationContextValue {
  const context = useContext(IdentityConfirmationContext);
  if (!context)
    throw new Error('useIdentityConfirmation must be used inside IdentityConfirmationProvider.');
  return context;
}
