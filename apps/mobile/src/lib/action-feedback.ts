import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { Href } from 'expo-router';

import { buildSetupAccountHref } from './setup-account';

interface AlertNavigation {
  push(pathname: Href): void;
}

export interface SnackbarState {
  readonly visible: boolean;
  readonly message: string | null;
  readonly tone: 'success' | 'danger' | 'neutral';
}

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

function resolveBlockedAction(
  message: string,
  context?: BlockedActionContext,
): BlockedActionResolution | null {
  const normalized = message.toLocaleLowerCase('es-CO');
  const missingDisplayName =
    context?.profile?.displayName === undefined
      ? false
      : !((context.profile.displayName ?? '').trim().length);
  const nextRequiredStep = !context?.profile?.phoneE164 || missingDisplayName ? 'profile' : 'photo';

  if (normalized.includes('completa tu perfil')) {
    return {
      title: 'Completa tu perfil para continuar',
      message: 'Antes de mover dinero necesitamos nombre usable, foto y celular unico en tu cuenta.',
      ctaLabel: 'Completar ahora',
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
      message: 'Esta accion requiere un dispositivo confiable. Puedes validarlo en el setup de seguridad.',
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
