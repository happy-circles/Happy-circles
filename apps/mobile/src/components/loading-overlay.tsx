import { Modal, StyleSheet, Text, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';

export interface LoadingOverlayProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly variant?: 'loading' | 'success';
}

export function LoadingOverlay({ message, title, variant = 'loading', visible }: LoadingOverlayProps) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <HappyCirclesMotion size={104} variant={variant} />
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: 360,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    width: '100%',
    ...theme.shadow.floating,
  },
  copy: {
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
});
