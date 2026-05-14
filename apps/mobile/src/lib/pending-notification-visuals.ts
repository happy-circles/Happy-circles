import type { AppTheme } from '@/lib/theme';

export function pendingNotificationDotColor(activeTheme: AppTheme): string {
  return activeTheme.colors.cycle;
}

export function pendingNotificationSurfaceColor(activeTheme: AppTheme): string {
  return activeTheme.scheme === 'dark'
    ? withAlpha(activeTheme.colors.pending, 0.1)
    : activeTheme.colors.pendingSoft;
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.trim();
  const compactHexMatch = normalized.match(/^#([\da-f]{3})$/i);
  if (compactHexMatch) {
    const [red, green, blue] = compactHexMatch[1].split('').map((entry) => entry + entry);
    return withAlpha(`#${red}${green}${blue}`, alpha);
  }

  const hexMatch = normalized.match(/^#([\da-f]{6})$/i);
  if (!hexMatch) {
    return color;
  }

  const rawHex = hexMatch[1];
  const red = Number.parseInt(rawHex.slice(0, 2), 16);
  const green = Number.parseInt(rawHex.slice(2, 4), 16);
  const blue = Number.parseInt(rawHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
