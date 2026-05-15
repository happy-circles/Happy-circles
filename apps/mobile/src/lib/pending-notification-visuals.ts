import { colorWithAlpha, type AppTheme } from '@/lib/theme';

export function pendingNotificationDotColor(activeTheme: AppTheme): string {
  return activeTheme.colors.cycle;
}

export function pendingNotificationSurfaceColor(activeTheme: AppTheme): string {
  return activeTheme.scheme === 'dark'
    ? colorWithAlpha(activeTheme.colors.pending, 0.1)
    : activeTheme.colors.pendingSoft;
}
