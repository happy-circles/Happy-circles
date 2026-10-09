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
import {
  beginIdentityConfirmationPresentation,
  IDENTITY_MODAL_DISMISS_TIMEOUT_MS,
} from '@/lib/identity-modal-coordination';
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
  IdentityConfirmationUnavailableError,
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
  const closingPresentationRef = useRef<Promise<boolean> | null>(null);
  const dismissedPresentationsRef = useRef(new WeakSet<object>());
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

  const closeDialog = useCallback(async (): Promise<boolean> => {
    if (closingPresentationRef.current) return closingPresentationRef.current;
    if (!mountedRef.current) return false;
    setRequest(null);
    setDialogVisible(false);
    setBusyMethod(null);
    setPassword('');
    setError(null);
    const presentation = presentationRef.current;
    if (!presentation) return true;
    if (dialogVisibleRef.current) {
      dialogVisibleRef.current = false;
      const waitForNativeDismiss = Platform.OS === 'ios';
      const closing = withSessionOperationTimeout(
        'dismiss-identity-dialog',
        Promise.resolve().then(() => presentation.closing(waitForNativeDismiss)),
        IDENTITY_MODAL_DISMISS_TIMEOUT_MS + 250,
      )
        .then(() => !waitForNativeDismiss || dismissedPresentationsRef.current.has(presentation))
        .catch(() => {
          presentation.release();
          return false;
        })
        .finally(() => {
          if (presentationRef.current === presentation) presentationRef.current = null;
          if (closingPresentationRef.current === closing) closingPresentationRef.current = null;
        });
      closingPresentationRef.current = closing;
      return closing;
    } else {
      presentation.release();
      presentationRef.current = null;
      return true;
    }
  }, []);

  const cancel = useCallback(() => {
    requests.cancel();
    void closeDialog();
  }, [closeDialog, requests]);

  const failConfirmation = useCallback(
    (failure: IdentityConfirmationUnavailableError) => {
      requests.fail(failure);
      void closeDialog();
    },
    [closeDialog, requests],
  );

  const finish = useCallback(
    async (pending: IdentityConfirmationRequest, confirmed: boolean) => {
      if (!requests.isCurrent(pending, sessionRef.current.userId)) return;
      const active = confirmed ? await waitForActiveApp() : false;
      if (!requests.isCurrent(pending, sessionRef.current.userId)) return;
      if (!active) {
        failConfirmation(
          new IdentityConfirmationUnavailableError(
            'Vuelve a la app para autorizar esta sesión. Tu borrador permanece disponible.',
          ),
        );
        return;
      }
      const dismissed = await closeDialog();
      if (!requests.isCurrent(pending, sessionRef.current.userId)) {
        requests.fail(
          new IdentityConfirmationUnavailableError(
            'La sesión cambió. Vuelve a intentar desde la cuenta actual.',
            'auth_required',
          ),
          pending,
        );
        return;
      }
      if (!dismissed) {
        failConfirmation(
          new IdentityConfirmationUnavailableError(
            'No pudimos cerrar la autorización de forma segura. Intenta nuevamente; tu borrador permanece disponible.',
          ),
        );
        return;
      }
      const activeAfterDismiss = await waitForActiveApp();
      if (!requests.isCurrent(pending, sessionRef.current.userId)) {
        requests.fail(
          new IdentityConfirmationUnavailableError(
            'La sesión cambió. Vuelve a intentar desde la cuenta actual.',
            'auth_required',
          ),
          pending,
        );
        return;
      }
      if (!activeAfterDismiss || AppState.currentState !== 'active') {
        failConfirmation(
          new IdentityConfirmationUnavailableError(
            'Vuelve a la app para autorizar esta sesión. Tu borrador permanece disponible.',
          ),
        );
        return;
      }
      if (operationRef.current?.requestId === pending.id) operationRef.current = null;
      requests.finish(pending, sessionRef.current.userId, true);
    },
    [closeDialog, failConfirmation, requests],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requests.fail(
        new IdentityConfirmationUnavailableError(
          'La autorización se interrumpió. Intenta nuevamente desde la app.',
        ),
      );
      operationRef.current = null;
      presentationRef.current?.release();
      presentationRef.current = null;
    };
  }, [requests]);

  useEffect(() => {
    if (request && request.userId !== session.userId)
      failConfirmation(
        new IdentityConfirmationUnavailableError(
          'La sesión cambió. Vuelve a intentar desde la cuenta actual.',
          'auth_required',
        ),
      );
  }, [failConfirmation, request, session.userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && !operationRef.current?.externalHandoff)
        failConfirmation(
          new IdentityConfirmationUnavailableError(
            'La autorización se interrumpió al salir de la app. Intenta nuevamente; tu borrador permanece disponible.',
          ),
        );
    });
    return () => subscription.remove();
  }, [failConfirmation]);

  const present = useCallback(
    async (pending: IdentityConfirmationRequest): Promise<boolean> => {
      try {
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
          if (requests.fail(new IdentityConfirmationUnavailableError(), pending))
            void closeDialog();
          return false;
        }
        setDialogPresentation({ request: pending, presentation });
        dialogVisibleRef.current = true;
        setDialogVisible(true);
        return true;
      } catch {
        if (requests.fail(new IdentityConfirmationUnavailableError(), pending)) void closeDialog();
        return false;
      }
    },
    [closeDialog, requests],
  );

  const confirmIdentity = useCallback(
    async (input: IdentityConfirmationInput): Promise<boolean> => {
      const current = sessionRef.current;
      if (!current.userId)
        throw new IdentityConfirmationUnavailableError(
          'Inicia sesión nuevamente para autorizar este movimiento.',
          'auth_required',
        );
      if (!mountedRef.current || AppState.currentState !== 'active')
        throw new IdentityConfirmationUnavailableError(
          'Vuelve a la app e intenta autorizar nuevamente. Tu borrador permanece disponible.',
        );
      if (operationRef.current || presentationRef.current)
        throw new IdentityConfirmationUnavailableError(
          'Ya hay una autorización en curso. Espera a que termine e intenta nuevamente.',
          'identity_confirmation_busy',
        );
      const pending = requests.begin(current.userId, input);
      if (!pending)
        throw new IdentityConfirmationUnavailableError(
          'Ya hay una autorización en curso. Espera a que termine e intenta nuevamente.',
          'identity_confirmation_busy',
        );
      if (canReuseIdentityConfirmation(input, current)) {
        requests.finish(pending.request, current.userId, true);
        return pending.promise;
      }

      const currentMethods = availableIdentityConfirmationMethods({
        purpose: input.purpose,
        isAuthorizedDeviceSession: current.isAuthorizedDeviceSession,
        biometricAvailable: current.biometricAvailable,
        hasGoogle: current.linkedMethods.hasGoogle,
        hasApple: current.linkedMethods.hasApple,
        appleSignInAvailable: current.appleSignInAvailable,
        hasPassword: current.linkedMethods.hasEmailPassword,
      });
      if (input.purpose === 'sensitive' && currentMethods.length === 0) {
        requests.fail(
          new IdentityConfirmationUnavailableError(
            'No hay un método de esta cuenta disponible en este teléfono. Vuelve a iniciar sesión con un método vinculado; tu borrador permanece disponible.',
            'auth_required',
          ),
          pending.request,
        );
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
              else if (currentMethods.length === 0) {
                failConfirmation(
                  new IdentityConfirmationUnavailableError(
                    result.error === 'recent_auth_required'
                      ? 'No hay un método de esta cuenta disponible en este teléfono. Vuelve a iniciar sesión con un método vinculado; tu borrador permanece disponible.'
                      : 'No pudimos autorizar esta sesión. Intenta nuevamente; tu borrador permanece disponible.',
                    result.error === 'recent_auth_required'
                      ? 'auth_required'
                      : 'identity_confirmation_unavailable',
                  ),
                );
              } else
                setError(
                  result.error === 'recent_auth_required'
                    ? 'Confirma con un método vinculado a tu cuenta para autorizar esta sesión. Tu borrador permanece disponible.'
                    : (result.message ?? 'Confirma con un método de tu cuenta para continuar.'),
                );
            }
          } catch (failure) {
            if (requests.isCurrent(pending.request, sessionRef.current.userId)) {
              const nextMessage = sessionOperationErrorMessage(
                failure,
                currentMethods.length === 0
                  ? 'No pudimos autorizar esta sesión. Intenta nuevamente; tu borrador permanece disponible.'
                  : 'No pudimos comprobar esta sesión. Usa un método de tu cuenta.',
              );
              if (currentMethods.length === 0)
                failConfirmation(new IdentityConfirmationUnavailableError(nextMessage));
              else setError(nextMessage);
            }
          } finally {
            if (operationRef.current?.requestId === pending.request.id) {
              operationRef.current = null;
              if (mountedRef.current) setBusyMethod(null);
            }
          }
        })();
      } else void present(pending.request);
      return pending.promise;
    },
    [failConfirmation, finish, present, requests],
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
      if (operationRef.current?.requestId === request.id) {
        operationRef.current = null;
        if (mountedRef.current) setBusyMethod(null);
      }
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
          onClose={() => {
            if (requests.isCurrent(dialogPresentation.request, sessionRef.current.userId)) cancel();
          }}
          onDismiss={() => {
            dismissedPresentationsRef.current.add(dialogPresentation.presentation);
            dialogPresentation.presentation.release();
          }}
          onPasswordChange={setPassword}
          onSubmit={(method) => void submit(method)}
          password={password}
          purpose={dialogPresentation.request.input.purpose}
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
