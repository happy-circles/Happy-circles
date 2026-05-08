import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { theme } from '@/lib/theme';

import type { RowTone } from './profile-helpers';

type IoniconName = keyof typeof Ionicons.glyphMap;

function resolveRowTone(tone: RowTone) {
  if (tone === 'success') {
    return {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
    };
  }

  if (tone === 'primary') {
    return {
      backgroundColor: theme.colors.primarySoft,
      color: theme.colors.primary,
    };
  }

  return {
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.textMuted,
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
  const visual = resolveRowTone(tone);

  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusIcon, { backgroundColor: visual.backgroundColor }]}>
        <Ionicons color={visual.color} name={icon} size={20} />
      </View>
      <View style={styles.textWrap}>
        <AppText style={styles.rowTitle}>{title}</AppText>
        {subtitle ? <AppText style={styles.rowSubtitle}>{subtitle}</AppText> : null}
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
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
});
