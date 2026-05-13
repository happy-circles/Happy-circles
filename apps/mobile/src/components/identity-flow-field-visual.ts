import type { AppTheme } from '@/lib/theme';

export type IdentityFlowFieldStatus = 'danger' | 'idle' | 'success' | 'warning';

export function resolveFieldVisual(status: IdentityFlowFieldStatus, activeTheme: AppTheme) {
  if (status === 'success') {
    return {
      backgroundColor: activeTheme.colors.successSoft,
      borderColor: activeTheme.colors.border,
      color: activeTheme.colors.success,
      panelColor: activeTheme.colors.successSoft,
    };
  }

  if (status === 'danger' || status === 'warning') {
    const color = status === 'warning' ? activeTheme.colors.warning : activeTheme.colors.danger;
    const panelColor =
      status === 'warning' ? activeTheme.colors.warningSoft : activeTheme.colors.dangerSoft;

    return {
      backgroundColor:
        status === 'warning' ? activeTheme.colors.warningSoft : activeTheme.colors.dangerSoft,
      borderColor: color,
      color,
      panelColor,
    };
  }

  return {
    backgroundColor: activeTheme.colors.primarySoft,
    borderColor: activeTheme.colors.border,
    color: activeTheme.colors.primary,
    panelColor: activeTheme.colors.primaryGhost,
  };
}
