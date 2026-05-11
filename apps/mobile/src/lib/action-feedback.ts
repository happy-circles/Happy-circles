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
    message: 'Propuesta',
    title: 'Aceptando',
  },
  approveSettlement: {
    message: 'Happy Circle',
    title: 'Aprobando',
  },
  createMovement: {
    message: 'Movimiento',
    title: 'Guardando',
  },
  executeSettlement: {
    message: 'Happy Circle',
    title: 'Completando',
  },
  requestAccountDeletion: {
    message: 'Cuenta',
    title: 'Eliminando',
  },
};

interface BlockedActionResolution {
  readonly title: string;
  readonly message: string;
  readonly ctaLabel: string;
  readonly route: Href;
}

interface BlockedActionContext {
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
        resultOverlayTimeoutRef.current = setTimeout(() => {
          setResultOverlay(null);
          resultOverlayTimeoutRef.current = null;
          resultResolveRef.current = null;
          resolve();
        }, nextResult.durationMs ?? (nextVariant === 'danger' ? 2200 : resultDurationMs));
      });
    },
    [clearResultTimeout, resultDurationMs],
  );

  const runBlockingAction = useCallback(
    async <Result,>(
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

function resolveBlockedAction(
  message: string,
  context?: BlockedActionContext,
): BlockedActionResolution | null {
  const normalized = message.toLocaleLowerCase('es-CO');
  const missingDisplayName =
    context?.profile?.displayName === undefined
      ? false
      : !(context.profile.displayName ?? '').trim().length;
  const missingEmail =
    normalized.includes('confirma tu correo') ||
    normalized.includes('correo sin confirmar') ||
    context?.profile?.emailConfirmed === false;
  const nextRequiredStep = missingEmail
    ? 'email'
    : !context?.profile?.phoneE164 || missingDisplayName
      ? 'profile'
      : 'profile';

  if (normalized.includes('completa tu perfil') || normalized.includes('confirma tu correo')) {
    return {
      title: missingEmail
        ? 'Confirma tu correo para continuar'
        : 'Completa tu perfil para continuar',
      message: missingEmail
        ? 'Reenvia el correo desde tu perfil y abre el enlace de confirmacion.'
        : 'Antes de mover dinero necesitamos nombre usable y celular unico en tu cuenta.',
      ctaLabel: missingEmail ? 'Abrir perfil' : 'Completar ahora',
      route: buildSetupAccountHref(nextRequiredStep),
    };
  }

  if (
    normalized.includes('dispositivo aun no es confiable') ||
    normalized.includes('confiar este dispositivo') ||
    (normalized.includes('solo puedes') && normalized.includes('dispositivo confiable'))
  ) {
    return {
      title: 'Valida este dispositivo para continuar',
      message:
        'Esta acción requiere un dispositivo confiable. Puedes validarlo en el setup de seguridad.',
      ctaLabel: 'Abrir setup',
      route: buildSetupAccountHref('security'),
    };
  }

  if (
    normalized.includes('no se pudo validar tu identidad') ||
    normalized.includes('no se pudo validar') ||
    normalized.includes('desbloquea el dispositivo') ||
    normalized.includes('no puede usar') ||
    normalized.includes('bloqueado temporalmente')
  ) {
    return {
      title: 'Valida tu identidad para continuar',
      message,
      ctaLabel: 'Abrir setup',
      route: buildSetupAccountHref('security'),
    };
  }

  return null;
}

export function showBlockedActionAlert(
  message: string,
  navigation: AlertNavigation,
  context?: BlockedActionContext,
) {
  const resolution = resolveBlockedAction(message, context);
  if (!resolution) {
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
