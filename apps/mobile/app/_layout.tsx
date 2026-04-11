import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import type { Href } from 'expo-router';

import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import { addNotificationResponseListener, configureNotifications } from '@/lib/notifications';
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

function SessionOverlay() {
  const { biometricLabel, email, isLocked, signOut, status, unlock } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const autoUnlockTriggeredRef = useRef(false);

  const attemptUnlock = useCallback(
    async (automatic: boolean) => {
      if (isAuthenticating) {
        return;
      }

      setIsAuthenticating(true);
      setMessage(null);

      const authenticated = await unlock();
      if (!authenticated) {
        setMessage(
          automatic
            ? `No se pudo validar ${biometricLabel}. Intenta otra vez o cierra sesion.`
            : `No se pudo validar ${biometricLabel}.`,
        );
      }

      setIsAuthenticating(false);
    },
    [biometricLabel, isAuthenticating, unlock],
  );

  useEffect(() => {
    if (!isLocked) {
      autoUnlockTriggeredRef.current = false;
      setMessage(null);
      setIsAuthenticating(false);
      return;
    }

    if (status === 'loading' || autoUnlockTriggeredRef.current) {
      return;
    }

    autoUnlockTriggeredRef.current = true;
    void attemptUnlock(true);
  }, [attemptUnlock, isLocked, status]);

  if (status === 'loading') {
    return (
      <View style={styles.overlay}>
        <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
          <Text style={styles.lockTitle}>Cargando Happy Circles</Text>
          <Text style={styles.lockSubtitle}>Preparando sesion y ajustes locales.</Text>
        </SurfaceCard>
      </View>
    );
  }

  if (!isLocked) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <SurfaceCard padding="lg" style={styles.lockCard} variant="elevated">
        <Text style={styles.lockTitle}>{isAuthenticating ? `Verificando ${biometricLabel}` : 'App bloqueada'}</Text>
        <Text style={styles.lockSubtitle}>
          {email ?? 'Tu sesion'} requiere {biometricLabel} para entrar sin volver a escribir tu clave.
        </Text>
        {message ? <Text style={styles.lockMessage}>{message}</Text> : null}
        <PrimaryAction
          label={isAuthenticating ? `Validando ${biometricLabel}...` : `Entrar con ${biometricLabel}`}
          subtitle="Si la validacion sale bien, entraras de una vez."
          onPress={isAuthenticating ? undefined : () => void attemptUnlock(false)}
        />
        <PrimaryAction label="Cerrar sesion" onPress={() => void signOut()} variant="secondary" />
      </SurfaceCard>
    </View>
  );
}

function SessionRouteGuard() {
  const { status } = useSession();
  const rootNavigationState = useRootNavigationState();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!rootNavigationState?.key || status === 'loading') {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'signed_out') {
      if (!inAuthGroup) {
        router.replace('/sign-in');
      }
      return;
    }

    if (inAuthGroup) {
      router.replace('/home');
    }
  }, [rootNavigationState?.key, router, segments, status]);

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
