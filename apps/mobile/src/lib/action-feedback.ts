import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { Href } from 'expo-router';

import { triggerIdentityWarningHaptic } from './identity-flow-haptics';
import { triggerAppErrorHaptic, triggerAppSuccessHaptic } from './app-haptics';
import { buildSetupAccountHref } from './setup-account';

interface AlertNavigation {
  push(pathname: Href): void;
}

export interface SnackbarState {
  readonly visible: boolean;
  readonly message: string | null;
  readonly tone: 'success' | 'danger' | 'neutral';
}

export type ActionFeedbackVariant = 'loading' | 'success' | 'danger';

export type BlockingActionKey =
  | 'amendMovement'
  | 'createMovement'
  | 'acceptFinancialRequest'
  | 'approveSettlement'
  | 'executeSettlement'
  | 'requestAccountDeletion';

export interface BlockingActionFeedbackCopy {
  readonly message?: string;
  readonly title: string;
}

interface ActionFeedbackOverlayCopy extends BlockingActionFeedbackCopy {
  readonly variant: ActionFeedbackVariant;
}

export interface ActionFeedbackResult extends BlockingActionFeedbackCopy {
  readonly durationMs?: number;
  readonly haptic?: 'error' | 'none' | 'success';
  readonly variant?: Exclude<ActionFeedbackVariant, 'loading'>;
}

export interface ActionFeedbackOverlayProps {
  readonly message?: string;
  readonly title: string;
  readonly variant: ActionFeedbackVariant;
  readonly visible: boolean;
}

export interface ActionFeedbackOverlayOptions {
  readonly delayMs?: number;
  readonly resultDurationMs?: number;
}

// Blocking overlays are reserved for financial/account actions where leaving mid-flight is risky.
export const BLOCKING_ACTION_FEEDBACK: Record<BlockingActionKey, BlockingActionFeedbackCopy> = {
  acceptFinancialRequest: {
    message: 'Confirmando balance',
    title: 'Activando',
  },
  amendMovement: {
    message: 'Rearmando el caso',
    title: 'Enviando correccion',
  },
  approveSettlement: {
    message: 'Preparando recompensa',
    title: 'Aprobando Circle',
  },
  createMovement: {
    message: 'Conectando saldo',
    title: 'Creando movimiento',
  },
  executeSettlement: {
    message: 'Abriendo tesoro',
    title: 'Completando Circle',
  },
  requestAccountDeletion: {
    message: 'Cuenta',
    title: 'Eliminando',
  },
};

interface BlockedActionCopy {
  readonly title: string;
  readonly message: string;
  readonly ctaLabel: string;
}

export type BlockedActionResolution = BlockedActionCopy &
  (
    | { readonly presentation?: 'alert'; readonly route: Href }
    | { readonly presentation: 'inline'; readonly route?: never }
  );

export interface BlockedActionContext {
  readonly hasEmailPassword?: boolean;
  readonly profile?: {
    readonly displayName?: string | null;
    readonly emailConfirmed?: boolean;
    readonly avatarPath?: string | null;
    readonly phoneE164?: string | null;
  };
}

export function useFeedbackSnackbar(durationMs = 2800) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    visible: false,
    message: null,
    tone: 'neutral',
  });

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const hideSnackbar = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setSnackbar((current) => ({
      ...current,
      visible: false,
    }));
  }, []);

  const showSnackbar = useCallback(
    (message: string, tone: SnackbarState['tone'] = 'neutral') => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setSnackbar({
        visible: true,
        message,
        tone,
      });

      timeoutRef.current = setTimeout(() => {
        setSnackbar((current) => ({
          ...current,
          visible: false,
        }));
        timeoutRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  return {
    snackbar,
    hideSnackbar,
    showSnackbar,
  };
}

export function useDelayedBusy(active: boolean, delayMs = 350) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timeout = setTimeout(() => {
      setVisible(true);
    }, delayMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [active, delayMs]);

  return visible;
}

export function useActionFeedbackOverlay({
  delayMs = 350,
  resultDurationMs = 1400,
}: ActionFeedbackOverlayOptions = {}) {
  const resultOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultResolveRef = useRef<(() => void) | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<BlockingActionKey | null>(null);
  const [resultOverlay, setResultOverlay] = useState<ActionFeedbackOverlayCopy | null>(null);
  const showBusyOverlay = useDelayedBusy(Boolean(busyActionKey), delayMs);

  const clearResultTimeout = useCallback(() => {
    if (resultOverlayTimeoutRef.current) {
      clearTimeout(resultOverlayTimeoutRef.current);
      resultOverlayTimeoutRef.current = null;
    }

    if (resultResolveRef.current) {
      resultResolveRef.current();
      resultResolveRef.current = null;
    }
  }, []);

  useEffect(() => () => clearResultTimeout(), [clearResultTimeout]);

  const clear = useCallback(() => {
    clearResultTimeout();
    setBusyActionKey(null);
    setResultOverlay(null);
  }, [clearResultTimeout]);

  const showResult = useCallback(
    (nextResult: ActionFeedbackResult) => {
      clearResultTimeout();
      setBusyActionKey(null);
      const nextVariant = nextResult.variant ?? 'success';

      if (nextResult.haptic !== 'none') {
        if (nextResult.haptic === 'error' || nextVariant === 'danger') {
          triggerAppErrorHaptic();
        } else {
          triggerAppSuccessHaptic();
        }
      }

      setResultOverlay({
        message: nextResult.message,
        title: nextResult.title,
        variant: nextVariant,
      });

      return new Promise<void>((resolve) => {
        resultResolveRef.current = resolve;
        resultOverlayTimeoutRef.current = setTimeout(
          () => {
            setResultOverlay(null);
            resultOverlayTimeoutRef.current = null;
            resultResolveRef.current = null;
            resolve();
          },
          nextResult.durationMs ?? (nextVariant === 'danger' ? 2200 : resultDurationMs),
        );
      });
    },
    [clearResultTimeout, resultDurationMs],
  );

  const runBlockingAction = useCallback(
    async <Result>(
      actionKey: BlockingActionKey,
      action: () => Promise<Result>,
    ): Promise<Result> => {
      clearResultTimeout();
      setResultOverlay(null);
      setBusyActionKey(actionKey);

      try {
        return await action();
      } finally {
        setBusyActionKey(null);
      }
    },
    [clearResultTimeout],
  );

  const loadingCopy = busyActionKey ? BLOCKING_ACTION_FEEDBACK[busyActionKey] : null;
  const overlayCopy = resultOverlay ?? loadingCopy;
  const overlayProps: ActionFeedbackOverlayProps = {
    message: overlayCopy?.message,
    title: overlayCopy?.title ?? 'Procesando acción',
    variant: resultOverlay?.variant ?? 'loading',
    visible: Boolean(resultOverlay) || showBusyOverlay,
  };

  return {
    clear,
    overlayProps,
    runBlockingAction,
    showResult,
  };
}

export function resolveBlockedAction(
  error: unknown,
  context?: BlockedActionContext,
): BlockedActionResolution | null {
  const record =
    error && typeof error === 'object'
      ? (error as { readonly message?: unknown; readonly code?: unknown })
      : null;
  const message =
    typeof error === 'string' ? error : typeof record?.message === 'string' ? record.message : '';
  const code = typeof record?.code === 'string' ? record.code.trim() : null;
  const normalized = message.toLocaleLowerCase('es-CO');
  if (code === 'identity_confirmation_busy') {
    return {
      presentation: 'inline',
      title: 'Hay una validación en curso',
      message: 'Termina la validación abierta y vuelve a intentar la acción.',
      ctaLabel: 'Reintentar',
    };
  }
  if (code === 'identity_confirmation_unavailable') {
    return {
      presentation: 'inline',
      title: 'Falta confirmar tu identidad',
      message: message || 'Vuelve a intentar la validación para continuar.',
      ctaLabel: 'Confirmar identidad',
    };
  }
  if (
    code === 'auth_required' ||
    normalized.includes('inicia sesión para continuar') ||
    normalized.includes('tu sesión ya no es válida') ||
    normalized.includes('autenticación requerida') ||
    normalized.includes('auth session missing')
  ) {
    return {
      title: 'Vuelve a iniciar sesión',
      message: 'Tu sesión ya no es válida. Ingresa nuevamente para continuar.',
      ctaLabel: 'Iniciar sesión',
      route: { pathname: '/join', params: { mode: 'sign-in' } },
    };
  }
  if (code === 'active_relationship_required') {
    return {
      title: 'Falta una relación activa',
      message: 'Conecta con esta persona antes de crear un movimiento.',
      ctaLabel: 'Abrir personas',
      route: '/people',
    };
  }
  const missingDisplayName =
    context?.profile?.displayName === undefined
      ? false
      : !(context.profile.displayName ?? '').trim().length;
  const missingEmail =
    code === 'email_confirmation_required' ||
    (code !== 'profile_incomplete' &&
      (context?.profile?.emailConfirmed === false ||
        ((code !== 'identity_incomplete' || context?.profile?.emailConfirmed !== true) &&
          (normalized.includes('confirma tu correo') ||
            normalized.includes('correo sin confirmar')))));
  const nextRequiredStep = missingEmail
    ? 'email'
    : !context?.profile?.phoneE164 || missingDisplayName
      ? 'profile'
      : 'profile';

  if (
    code === 'email_confirmation_required' ||
    code === 'profile_incomplete' ||
    code === 'identity_incomplete' ||
    normalized.includes('completa tu perfil') ||
    normalized.includes('confirma tu correo')
  ) {
    return {
      title: missingEmail
        ? 'Confirma tu correo para continuar'
        : 'Completa tu perfil para continuar',
      message: missingEmail
        ? 'Reenvía el correo desde tu perfil y abre el enlace de confirmación.'
        : 'Antes de mover dinero necesitamos nombre usable y celular único en tu cuenta.',
      ctaLabel: missingEmail ? 'Abrir perfil' : 'Completar ahora',
      route: buildSetupAccountHref(nextRequiredStep, { returnTo: 'previous' }),
    };
  }

  if (
    code === 'device_authorization_required' ||
    code === 'device_not_trusted' ||
    code === 'trusted_origin_required' ||
    normalized.includes('dispositivo aún no es confiable') ||
    normalized.includes('dispositivo aun no es confiable') ||
    normalized.includes('teléfono aún no es confiable') ||
    normalized.includes('telefono aun no es confiable') ||
    normalized.includes('confiar este dispositivo') ||
    normalized.includes('confiar este teléfono') ||
    normalized.includes('confiar este telefono') ||
    normalized.includes('confía este teléfono') ||
    normalized.includes('confia este telefono') ||
    (normalized.includes('solo puedes') && normalized.includes('dispositivo confiable'))
  ) {
    return {
      title:
        code === 'device_authorization_required'
          ? 'Autoriza este dispositivo para continuar'
          : 'Confía este teléfono para continuar',
      message:
        code === 'device_authorization_required'
          ? 'Confirma tu identidad en seguridad para autorizar esta sesión.'
          : 'Esta acción requiere un teléfono confiable. Puedes hacerlo en seguridad.',
      ctaLabel: 'Abrir seguridad',
      route: buildSetupAccountHref('security', { returnTo: 'previous' }),
    };
  }

  if (
    code === 'recent_auth_required' ||
    normalized.includes('no se pudo validar tu identidad') ||
    normalized.includes('no se pudo validar') ||
    normalized.includes('desbloquea el dispositivo') ||
    normalized.includes('no puede usar') ||
    normalized.includes('bloqueado temporalmente')
  ) {
    return {
      title: 'Valida tu identidad para continuar',
      message:
        code === 'recent_auth_required'
          ? 'Vuelve a confirmar tu identidad para completar esta acción.'
          : message,
      ctaLabel: 'Abrir seguridad',
      route: buildSetupAccountHref('security', {
        returnTo: 'previous',
        reason: 'identity',
      }),
    };
  }

  return null;
}

export function showBlockedActionAlert(
  error: unknown,
  navigation: AlertNavigation,
  context?: BlockedActionContext,
) {
  const resolution = resolveBlockedAction(error, context);
  if (!resolution || resolution.presentation === 'inline') {
    return false;
  }

  triggerIdentityWarningHaptic();
  Alert.alert(resolution.title, resolution.message, [
    {
      text: 'Ahora no',
      style: 'cancel',
    },
    {
      text: resolution.ctaLabel,
      onPress: () => navigation.push(resolution.route),
    },
  ]);

  return true;
}
