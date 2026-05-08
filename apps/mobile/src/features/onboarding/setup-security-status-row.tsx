import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';

import type { SecurityTone } from './setup-account-helpers';

type IoniconName = keyof typeof Ionicons.glyphMap;

function resolveSecurityTone(tone: SecurityTone) {
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

  return {
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.textMuted,
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
  const visual = resolveSecurityTone(tone);

  return (
    <View style={styles.securityRow}>
      <View style={[styles.securityIcon, { backgroundColor: visual.backgroundColor }]}>
        <Ionicons color={visual.color} name={icon} size={20} />
      </View>
      <View style={styles.textWrap}>
        <AppText style={styles.readOnlyTitle}>{title}</AppText>
        {subtitle ? <AppText style={styles.readOnlySubtitle}>{subtitle}</AppText> : null}
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
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  readOnlySubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  securityStatus: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
