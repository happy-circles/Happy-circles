import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

import type { SecurityTone } from './setup-account-helpers';

type IoniconName = keyof typeof Ionicons.glyphMap;

function resolveSecurityTone(tone: SecurityTone, activeTheme: AppTheme) {
  if (tone === 'success') {
    return {
      backgroundColor: activeTheme.colors.successSoft,
      color: activeTheme.colors.success,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: activeTheme.colors.dangerSoft,
      color: activeTheme.colors.danger,
    };
  }

  return {
    backgroundColor: activeTheme.colors.surfaceSoft,
    color: activeTheme.colors.textMuted,
  };
}

export function SecurityStatusRow({
  icon,
  status,
  subtitle,
  title,
  tone,
  trailing,
}: {
  readonly icon: IoniconName;
  readonly status?: string;
  readonly subtitle?: string;
  readonly title: string;
  readonly tone: SecurityTone;
  readonly trailing?: ReactNode;
}) {
  const activeTheme = useAppTheme();
  const visual = resolveSecurityTone(tone, activeTheme);

  return (
    <View style={styles.securityRow}>
      <View style={[styles.securityIcon, { backgroundColor: visual.backgroundColor }]}>
        <Ionicons color={visual.color} name={icon} size={20} />
      </View>
      <View style={styles.textWrap}>
        <AppText style={[styles.readOnlyTitle, { color: activeTheme.colors.text }]}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText style={[styles.readOnlySubtitle, { color: activeTheme.colors.textMuted }]}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ?? (
        <AppText style={[styles.securityStatus, { color: visual.color }]}>{status}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  securityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  securityIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  readOnlyTitle: {
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  readOnlySubtitle: {
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  securityStatus: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
