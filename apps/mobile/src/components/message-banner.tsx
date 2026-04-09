import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

type MessageBannerTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface MessageBannerProps {
  readonly message: string;
  readonly tone?: MessageBannerTone;
}

export function MessageBanner({ message, tone = 'primary' }: MessageBannerProps) {
  return (
    <View
      style={[
        styles.base,
        tone === 'primary' ? styles.primary : null,
        tone === 'success' ? styles.success : null,
        tone === 'warning' ? styles.warning : null,
        tone === 'danger' ? styles.danger : null,
        tone === 'neutral' ? styles.neutral : null,
      ]}
    >
      <View
        style={[
          styles.sideBar,
          tone === 'primary' ? styles.primaryBar : null,
          tone === 'success' ? styles.successBar : null,
          tone === 'warning' ? styles.warningBar : null,
          tone === 'danger' ? styles.dangerBar : null,
          tone === 'neutral' ? styles.neutralBar : null,
        ]}
      />
      <Text
        style={[
          styles.text,
          tone === 'primary' ? styles.primaryText : null,
          tone === 'success' ? styles.successText : null,
          tone === 'warning' ? styles.warningText : null,
          tone === 'danger' ? styles.dangerText : null,
          tone === 'neutral' ? styles.neutralText : null,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.medium,
    overflow: 'hidden',
    paddingBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    position: 'relative',
  },
  sideBar: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5,
  },
  text: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  primary: {
    backgroundColor: theme.colors.primarySoft,
  },
  success: {
    backgroundColor: theme.colors.successSoft,
  },
  warning: {
    backgroundColor: theme.colors.warningSoft,
  },
  danger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  neutral: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  primaryBar: {
    backgroundColor: theme.colors.primary,
  },
  successBar: {
    backgroundColor: theme.colors.success,
  },
  warningBar: {
    backgroundColor: theme.colors.warning,
  },
  dangerBar: {
    backgroundColor: theme.colors.danger,
  },
  neutralBar: {
    backgroundColor: theme.colors.textMuted,
  },
  primaryText: {
    color: theme.colors.primary,
  },
  successText: {
    color: theme.colors.success,
  },
  warningText: {
    color: theme.colors.warning,
  },
  dangerText: {
    color: theme.colors.danger,
  },
  neutralText: {
    color: theme.colors.textMuted,
  },
});
