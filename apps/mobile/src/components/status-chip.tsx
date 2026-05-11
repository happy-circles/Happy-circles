import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { AppText } from '@/components/app-text';

type StatusChipTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'cycle';

export interface StatusChipProps {
  readonly label: string;
  readonly tone?: StatusChipTone;
  readonly compact?: boolean;
  readonly iconOnly?: boolean;
}

function statusIconName(label: string, tone: StatusChipTone): keyof typeof Ionicons.glyphMap {
  const normalized = label.toLocaleLowerCase('es-CO');

  if (
    tone === 'danger' ||
    normalized.includes('rechaz') ||
    normalized.includes('cancel') ||
    normalized.includes('no aprob')
  ) {
    return 'close';
  }

  if (
    tone === 'warning' ||
    normalized.includes('esperando') ||
    normalized.includes('pendiente') ||
    normalized.includes('curso') ||
    normalized.includes('requiere')
  ) {
    return 'time-outline';
  }

  if (
    tone === 'success' ||
    normalized.includes('registr') ||
    normalized.includes('aprob') ||
    normalized.includes('listo') ||
    normalized.includes('complet')
  ) {
    return 'checkmark';
  }

  if (tone === 'cycle') {
    return 'happy-outline';
  }

  if (normalized.includes('acceso') || normalized.includes('clave')) {
    return 'key-outline';
  }

  if (normalized.includes('aviso') || normalized.includes('notificacion')) {
    return 'notifications-outline';
  }

  if (
    normalized.includes('conexion') ||
    normalized.includes('conexión') ||
    normalized.includes('invitacion') ||
    normalized.includes('invitación')
  ) {
    return 'people-outline';
  }

  if (normalized.includes('seguridad') || normalized.includes('prioritario')) {
    return 'shield-checkmark-outline';
  }

  if (normalized.includes('enviad')) {
    return 'send-outline';
  }

  if (normalized.includes('creacion')) {
    return 'person-add-outline';
  }

  return 'information-circle-outline';
}

export function StatusChip({
  label,
  tone = 'neutral',
  compact = false,
  iconOnly = false,
}: StatusChipProps) {
  const iconName = statusIconName(label, tone);

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole={iconOnly ? 'image' : undefined}
      style={[
        styles.chip,
        compact ? styles.compactChip : null,
        iconOnly ? styles.iconChip : null,
        tone === 'primary' ? styles.primary : null,
        tone === 'success' ? styles.success : null,
        tone === 'warning' ? styles.warning : null,
        tone === 'danger' ? styles.danger : null,
        tone === 'neutral' ? styles.neutral : null,
        tone === 'cycle' ? styles.cycle : null,
      ]}
    >
      {iconOnly ? (
        <Ionicons color={statusTextColor(tone)} name={iconName} size={compact ? 13 : 15} />
      ) : (
        <AppText
          numberOfLines={1}
          style={[
            styles.label,
            compact ? styles.compactLabel : null,
            tone === 'primary' ? styles.primaryText : null,
            tone === 'success' ? styles.successText : null,
            tone === 'warning' ? styles.warningText : null,
            tone === 'danger' ? styles.dangerText : null,
            tone === 'neutral' ? styles.neutralText : null,
            tone === 'cycle' ? styles.cycleText : null,
          ]}
        >
          {label}
        </AppText>
      )}
    </View>
  );
}

function statusTextColor(tone: StatusChipTone): string {
  if (tone === 'primary') {
    return theme.colors.primary;
  }
  if (tone === 'success') {
    return theme.colors.success;
  }
  if (tone === 'warning') {
    return theme.colors.warning;
  }
  if (tone === 'danger') {
    return theme.colors.danger;
  }
  if (tone === 'cycle') {
    return transactionCategoryColor('cycle');
  }

  return theme.colors.textMuted;
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: theme.radius.small,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  compactChip: {
    borderRadius: theme.radius.pill,
    flexShrink: 1,
    maxWidth: 136,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  iconChip: {
    borderRadius: theme.radius.pill,
    flexShrink: 0,
    height: 26,
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 26,
  },
  label: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 11,
    lineHeight: 12,
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
  cycle: {
    backgroundColor: '#eaf1ff',
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
  cycleText: {
    color: transactionCategoryColor('cycle'),
  },
});
