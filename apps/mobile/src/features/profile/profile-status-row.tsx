import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

import type { RowTone } from './profile-helpers';

type IoniconName = keyof typeof Ionicons.glyphMap;

function resolveRowTone(activeTheme: ReturnType<typeof useAppTheme>, tone: RowTone) {
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

  if (tone === 'primary') {
    return {
      backgroundColor: activeTheme.colors.primarySoft,
      color: activeTheme.colors.primary,
    };
  }

  return {
    backgroundColor: activeTheme.colors.surfaceSoft,
    color: activeTheme.colors.textMuted,
  };
}

function rowStatusTone(tone: RowTone): StatusChipProps['tone'] {
  if (tone === 'success') {
    return 'success';
  }

  if (tone === 'danger') {
    return 'danger';
  }

  if (tone === 'primary') {
    return 'primary';
  }

  return 'neutral';
}

export function ProfileStatusRow({
  icon,
  status,
  subtitle,
  title,
  tone = 'muted',
  trailing,
}: {
  readonly icon: IoniconName;
  readonly status?: string;
  readonly subtitle?: string;
  readonly title: string;
  readonly tone?: RowTone;
  readonly trailing?: ReactNode;
}) {
  const activeTheme = useAppTheme();
  const visual = resolveRowTone(activeTheme, tone);

  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusIcon, { backgroundColor: visual.backgroundColor }]}>
        <Ionicons color={visual.color} name={icon} size={20} />
      </View>
      <View style={styles.textWrap}>
        <AppText style={[styles.rowTitle, { color: activeTheme.colors.text }]}>{title}</AppText>
        {subtitle ? (
          <AppText style={[styles.rowSubtitle, { color: activeTheme.colors.textMuted }]}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ??
        (status ? <StatusChip compact label={status} tone={rowStatusTone(tone)} /> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  statusIcon: {
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
  rowTitle: {
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
});
