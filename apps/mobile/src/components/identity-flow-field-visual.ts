import { theme } from '@/lib/theme';

export type IdentityFlowFieldStatus = 'danger' | 'idle' | 'success' | 'warning';

export function resolveFieldVisual(status: IdentityFlowFieldStatus) {
  if (status === 'success') {
    return {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.border,
      color: theme.colors.success,
      panelColor: 'rgba(61, 186, 110, 0.08)',
    };
  }

  if (status === 'danger' || status === 'warning') {
    const color = status === 'warning' ? theme.colors.warning : theme.colors.danger;
    const panelColor =
      status === 'warning' ? 'rgba(249, 115, 22, 0.08)' : 'rgba(232, 96, 74, 0.08)';

    return {
      backgroundColor: status === 'warning' ? theme.colors.warningSoft : theme.colors.dangerSoft,
      borderColor: color,
      color,
      panelColor,
    };
  }

  return {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
    color: theme.colors.primary,
    panelColor: theme.colors.primaryGhost,
  };
}
