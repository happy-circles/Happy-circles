import { Modal, StyleSheet, Text, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';

export interface LoadingOverlayProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly variant?: 'loading' | 'success' | 'danger';
}

function motionVariant(variant: NonNullable<LoadingOverlayProps['variant']>) {
  if (variant === 'success') {
    return 'wink';
  }

  return variant === 'loading' ? 'loading' : 'idle';
}

export function LoadingOverlay({
  message,
  title,
  variant = 'loading',
  visible,
}: LoadingOverlayProps) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.scrim}>
        <View
          style={[
            styles.card,
            variant === 'success' ? styles.cardSuccess : null,
            variant === 'danger' ? styles.cardDanger : null,
          ]}
        >
          <HappyCirclesMotion
            color={variant === 'danger' ? theme.colors.danger : undefined}
            size={104}
            tone={variant === 'danger' ? 'mono' : 'brand'}
            variant={motionVariant(variant)}
          />
          <View style={styles.copy}>
            <Text
              style={[
                styles.title,
                variant === 'success' ? styles.titleSuccess : null,
                variant === 'danger' ? styles.titleDanger : null,
              ]}
            >
              {title}
            </Text>
            {message ? (
              <Text
                style={[
                  styles.message,
                  variant === 'success' || variant === 'danger' ? styles.messageResult : null,
                ]}
              >
                {message}
              </Text>
            ) : null}
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
  cardSuccess: {
    backgroundColor: theme.colors.successSoft,
    borderColor: 'rgba(61, 186, 110, 0.26)',
  },
  cardDanger: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: 'rgba(232, 96, 74, 0.28)',
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
  titleSuccess: {
    color: theme.colors.success,
  },
  titleDanger: {
    color: theme.colors.danger,
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  messageResult: {
    color: theme.colors.text,
  },
});
