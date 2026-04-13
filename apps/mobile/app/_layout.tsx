import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import type { Href } from 'expo-router';
import type { Json } from '@happy-circles/shared';

import { hrefForPendingInviteIntent, readPendingInviteIntent } from '@/lib/invite-intent';
import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import { appConfig } from '@/lib/config';
import { getCurrentAppVersion } from '@/lib/device-trust';
import { addNotificationResponseListener, configureNotifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { AppProviders } from '@/providers/app-providers';
import { useSession } from '@/providers/session-provider';

function NotificationBridge() {
  const router = useRouter();

  useEffect(() => {
    void configureNotifications();

    let currentSubscription: { remove(): void } | null = null;

    void addNotificationResponseListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === 'string') {
        router.push(href as Href);
      }
    }).then((subscription) => {
      currentSubscription = subscription;
    });

    return () => {
      currentSubscription?.remove();
    };
  }, [router]);

  return null;
}

type MinimumSupportedVersionSetting = {
  readonly minimumVersion: string;
  readonly message: string | null;
};

function normalizeVersion(version: string): number[] | null {
  const trimmed = version.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split('.');
  if (parts.length === 0) {
    return null;
  }

  const normalized: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    normalized.push(Number(part));
  }
  return normalized;
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseMinimumSupportedVersion(value: Json): MinimumSupportedVersionSetting | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const minimumVersion =
    typeof record.minimumVersion === 'string' ? record.minimumVersion.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';

  if (!minimumVersion) {
    return null;
  }

  return {
    minimumVersion,
    message: message || null,
  };
}

async function readMinimumSupportedVersion(): Promise<MinimumSupportedVersionSetting | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('value_json')
    .eq('key', 'mobile_min_supported_version')
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as { readonly value_json: Json } | null;
  return parseMinimumSupportedVersion(row?.value_json ?? null);
}

function MandatoryUpdateGate() {
  const currentVersion = getCurrentAppVersion();
  const minimumVersionQuery = useQuery({
    queryKey: ['app_settings', 'mobile_min_supported_version'],
    queryFn: readMinimumSupportedVersion,
    staleTime: 60_000,
  });

  const minimumVersion = minimumVersionQuery.data?.minimumVersion ?? null;
  const comparison =
    !__DEV__ && currentVersion && minimumVersion
      ? compareVersions(currentVersion, minimumVersion)
      : null;
  const requiresUpdate = comparison !== null && comparison < 0;

  if (!requiresUpdate) {
    return null;
  }

  const message =
    minimumVersionQuery.data?.message ??
    'Actualiza Happy Circles para seguir usando esta version de la app.';

  return (
    <View style={styles.overlay}>
      <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
        <Text style={styles.lockTitle}>Actualizacion obligatoria</Text>
        <Text style={styles.lockSubtitle}>{message}</Text>
        <Text style={styles.lockMessage}>
          Version actual: {currentVersion} · Version minima: {minimumVersion}
        </Text>
        <PrimaryAction
          label="Abrir sitio de actualizacion"
          subtitle={appConfig.appWebOrigin}
          onPress={() => void Linking.openURL(appConfig.appWebOrigin)}
        />
      </SurfaceCard>
    </View>
  );
}

function SessionOverlay() {
  const session = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [retryKey, setRetryKey] = useState(0);
  const autoUnlockTriggeredRef = useRef(false);

  const attemptUnlock = useCallback(
    async (automatic: boolean) => {
      if (isAuthenticating) {
        return;
      }

      setIsAuthenticating(true);
      setMessage(null);

      const result = await session.unlock();
      if (!result.success) {
        const isTransientAutomaticFailure =
          automatic && (result.error === 'app_cancel' || result.error === 'system_cancel');

        if (isTransientAutomaticFailure) {
          autoUnlockTriggeredRef.current = false;
          setTimeout(() => {
            setRetryKey((current) => current + 1);
          }, 350);
          setIsAuthenticating(false);
          return;
        }

        setMessage(
          result.error === 'device_untrusted'
            ? 'Este dispositivo aun no es confiable. Valida el dispositivo desde tu perfil.'
            : automatic
            ? `No se pudo validar ${session.biometricLabel}. Intenta otra vez o cierra sesion.`
            : result.error === 'user_cancel'
              ? `Cancelaste ${session.biometricLabel}.`
              : `No se pudo validar ${session.biometricLabel}.`,
        );
      }

      setIsAuthenticating(false);
    },
    [isAuthenticating, session],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session.isLocked) {
      autoUnlockTriggeredRef.current = false;
      setMessage(null);
      setIsAuthenticating(false);
      return;
    }

    if (session.status === 'loading' || autoUnlockTriggeredRef.current) {
      return;
    }

    if (appState !== 'active') {
      return;
    }

    autoUnlockTriggeredRef.current = true;
    const timer = setTimeout(() => {
      void attemptUnlock(true);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [appState, attemptUnlock, retryKey, session.isLocked, session.status]);

  if (session.status === 'loading') {
    return (
      <View style={styles.overlay}>
        <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
          <Text style={styles.lockTitle}>Cargando Happy Circles</Text>
          <Text style={styles.lockSubtitle}>Preparando sesion y ajustes locales.</Text>
        </SurfaceCard>
      </View>
    );
  }

  if (!session.isLocked) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
        <Text style={styles.lockTitle}>{isAuthenticating ? `Verificando ${session.biometricLabel}` : 'App bloqueada'}</Text>
        <Text style={styles.lockSubtitle}>
          {session.email ?? 'Tu sesion'} requiere {session.biometricLabel} para entrar sin volver a escribir tu clave.
        </Text>
        {message ? <Text style={styles.lockMessage}>{message}</Text> : null}
        <PrimaryAction
          label={isAuthenticating ? `Validando ${session.biometricLabel}...` : `Entrar con ${session.biometricLabel}`}
          subtitle="Si la validacion sale bien, entraras de una vez."
          onPress={isAuthenticating ? undefined : () => void attemptUnlock(false)}
        />
        <PrimaryAction label="Cerrar sesion" onPress={() => void session.signOut()} variant="secondary" />
      </SurfaceCard>
    </View>
  );
}

function SessionRouteGuard() {
  const { profileCompletionState, status } = useSession();
  const rootNavigationState = useRootNavigationState();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!rootNavigationState?.key || status === 'loading') {
      return;
    }

    let cancelled = false;

    async function syncRoutes() {
      const currentRootSegment = String(segments[0] ?? '');
      const inAuthGroup = currentRootSegment === '(auth)';
      const isCompleteProfileRoute = currentRootSegment === 'complete-profile';
      const isInviteLinkRoute = currentRootSegment === 'invite';
      const isPublicInviteRoute = isInviteLinkRoute;
      const isBasicReadableRoute =
        isCompleteProfileRoute ||
        isPublicInviteRoute ||
        currentRootSegment === '(tabs)' ||
        currentRootSegment === 'activity' ||
        currentRootSegment === 'profile' ||
        currentRootSegment === 'person' ||
        currentRootSegment === 'settlements';

      if (status === 'signed_out') {
        if (!inAuthGroup && !isPublicInviteRoute && !cancelled) {
          router.replace('/sign-in');
        }
        return;
      }

      if (profileCompletionState === 'incomplete' && !isBasicReadableRoute) {
        if (!cancelled) {
          router.replace('/complete-profile' as Href);
        }
        return;
      }

      const pendingIntent =
        profileCompletionState === 'complete' ? await readPendingInviteIntent() : null;
      const nextSignedInHref = pendingIntent ? hrefForPendingInviteIntent(pendingIntent) : '/home';

      if (profileCompletionState === 'complete' && isCompleteProfileRoute) {
        if (!cancelled) {
          router.replace(nextSignedInHref);
        }
        return;
      }

      if (inAuthGroup && !cancelled) {
        router.replace(
          (profileCompletionState === 'incomplete' ? '/complete-profile' : nextSignedInHref) as Href,
        );
      }
    }

    void syncRoutes();

    return () => {
      cancelled = true;
    };
  }, [profileCompletionState, rootNavigationState?.key, router, segments, status]);

  return null;
}

function RootNavigator() {
  return (
    <>
      <StatusBar style="dark" />
      <NotificationBridge />
      <SessionRouteGuard />
      <Stack
        screenOptions={{
          animationMatchesGesture: true,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
          fullScreenGestureEnabled: true,
          gestureDirection: 'horizontal',
          gestureEnabled: true,
          headerShown: false,
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
        }}
      />
      <MandatoryUpdateGate />
      <SessionOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: theme.spacing.lg,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  lockCard: {
    gap: theme.spacing.sm,
    maxWidth: 420,
    width: '100%',
    ...theme.shadow.floating,
  },
  lockTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  lockSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  lockMessage: {
    color: theme.colors.warning,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
