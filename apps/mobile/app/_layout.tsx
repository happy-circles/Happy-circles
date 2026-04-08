import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import type { Href } from 'expo-router';

import { PrimaryAction } from '@/components/primary-action';
import { configureNotifications, addNotificationResponseListener } from '@/lib/notifications';
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

  if (status === 'loading') {
    return (
      <View style={styles.overlay}>
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>Cargando Happy Circles</Text>
          <Text style={styles.lockSubtitle}>Preparando sesion y ajustes locales.</Text>
        </View>
      </View>
    );
  }

  if (!isLocked) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.lockCard}>
        <Text style={styles.lockTitle}>App bloqueada</Text>
        <Text style={styles.lockSubtitle}>
          {email ?? 'Tu sesion'} requiere {biometricLabel} para volver a entrar.
        </Text>
        {message ? <Text style={styles.lockMessage}>{message}</Text> : null}
        <PrimaryAction
          label={`Desbloquear con ${biometricLabel}`}
          onPress={() => {
            void unlock().then((result) => {
              if (!result) {
                setMessage('No se pudo validar la biometria. Intenta otra vez o cierra sesion.');
              }
            });
          }}
        />
        <PrimaryAction label="Cerrar sesion" onPress={() => void signOut()} variant="secondary" />
      </View>
    </View>
  );
}

function RootNavigator() {
  return (
    <>
      <StatusBar style="dark" />
      <NotificationBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
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
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    gap: theme.spacing.sm,
    maxWidth: 420,
    padding: theme.spacing.lg,
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
