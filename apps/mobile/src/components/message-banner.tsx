import { StyleSheet, View } from 'react-native';

import { theme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import { AppText } from '@/components/app-text';

export type MessageBannerTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface MessageBannerProps {
  readonly message: string;
  readonly tone?: MessageBannerTone;
}

export function MessageBanner({ message, tone = 'primary' }: MessageBannerProps) {
  const activeTheme = useAppTheme();
  const toneStyle = messageBannerToneStyle(activeTheme, tone);

  return (
    <View style={[styles.base, { backgroundColor: toneStyle.backgroundColor }]}>
      <View style={[styles.sideBar, { backgroundColor: toneStyle.barColor }]} />
      <AppText style={[styles.text, { color: toneStyle.textColor }]}>
        {message}
      </AppText>
    </View>
  );
}

function messageBannerToneStyle(activeTheme: AppTheme, tone: MessageBannerTone) {
  if (tone === 'success') {
    return {
      backgroundColor: activeTheme.colors.successSoft,
      barColor: activeTheme.colors.success,
      textColor: activeTheme.colors.success,
    };
  }

  if (tone === 'warning') {
    return {
      backgroundColor: activeTheme.colors.warningSoft,
      barColor: activeTheme.colors.warning,
      textColor: activeTheme.colors.warning,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: activeTheme.colors.dangerSoft,
      barColor: activeTheme.colors.danger,
      textColor: activeTheme.colors.danger,
    };
  }

  if (tone === 'neutral') {
    return {
      backgroundColor: activeTheme.colors.surfaceSoft,
      barColor: activeTheme.colors.textMuted,
      textColor: activeTheme.colors.textMuted,
    };
  }

  return {
    backgroundColor: activeTheme.colors.primarySoft,
    barColor: activeTheme.colors.primary,
    textColor: activeTheme.colors.primary,
  };
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
});
