import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BrandVerificationMark } from '@/components/brand-verification-lockup';
import { IDENTITY_FLOW_STAGE_SIZE } from '@/components/identity-flow';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';
import type { SessionLoadingStage } from '@/providers/session/types';

const SLOW_SESSION_LOADING_MS = 5200;

const SESSION_LOADING_MESSAGES: Record<SessionLoadingStage, string> = {
  starting: 'Preparando tu acceso',
  auth: 'Verificando tu sesión',
  account: 'Sincronizando tu acceso',
  profile: 'Sincronizando tu perfil',
  device: 'Revisando este dispositivo',
};

export function SessionLoadingScreen({ message }: { readonly message?: string }) {
  const activeTheme = useAppTheme();
  const { loadingStage } = useSession();
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (message) {
      setIsSlow(false);
      return undefined;
    }

    setIsSlow(false);
    const timer = setTimeout(() => {
      setIsSlow(true);
    }, SLOW_SESSION_LOADING_MS);

    return () => clearTimeout(timer);
  }, [message]);

  const resolvedMessage =
    message ?? (isSlow ? 'La conexión está tardando' : SESSION_LOADING_MESSAGES[loadingStage]);

  return (
    <View style={[styles.root, { backgroundColor: activeTheme.colors.background }]}>
      <View accessibilityLabel="Happy Circles esta sincronizando" accessibilityRole="image">
        <BrandVerificationMark showOuterInIdle size={IDENTITY_FLOW_STAGE_SIZE} state="loading" />
      </View>
      <AppText style={[styles.message, { color: activeTheme.colors.textMuted }]}>
        {resolvedMessage}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  message: {
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
});
