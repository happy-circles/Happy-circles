import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

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
    normalized.includes('invitación') ||
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
  const activeTheme = useAppTheme();
  const iconName = statusIconName(label, tone);
  const colors = statusColors(activeTheme, tone);

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole={iconOnly ? 'image' : undefined}
      style={[
        styles.chip,
        compact ? styles.compactChip : null,
        iconOnly ? styles.iconChip : null,
        { backgroundColor: colors.backgroundColor },
      ]}
    >
      {iconOnly ? (
        <Ionicons color={colors.color} name={iconName} size={compact ? 13 : 15} />
      ) : (
        <AppText
          numberOfLines={1}
          style={[styles.label, compact ? styles.compactLabel : null, { color: colors.color }]}
        >
          {label}
        </AppText>
      )}
    </View>
  );
}

function statusColors(activeTheme: ReturnType<typeof useAppTheme>, tone: StatusChipTone) {
  if (tone === 'primary') {
    return {
      backgroundColor: activeTheme.colors.primarySoft,
      color: activeTheme.colors.primary,
    };
  }
  if (tone === 'success') {
    return {
      backgroundColor: activeTheme.colors.successSoft,
      color: activeTheme.colors.success,
    };
  }
  if (tone === 'warning') {
    return {
      backgroundColor: activeTheme.colors.warningSoft,
      color: activeTheme.colors.warning,
    };
  }
  if (tone === 'danger') {
    return {
      backgroundColor: activeTheme.colors.dangerSoft,
      color: activeTheme.colors.danger,
    };
  }
  if (tone === 'cycle') {
    return {
      backgroundColor: activeTheme.colors.cycleSoft,
      color: activeTheme.colors.cycle,
    };
  }

  return {
    backgroundColor: activeTheme.colors.surfaceSoft,
    color: activeTheme.colors.textMuted,
  };
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
});
