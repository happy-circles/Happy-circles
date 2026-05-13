import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  isThemePreference,
  normalizeThemePreference,
  resolveThemeScheme,
  setRuntimeThemeScheme,
  theme,
  THEME_PREFERENCE_STORAGE_KEY,
  themes,
} from './theme';
import { cardStateColor } from './card-language';
import { transactionCategoryColor } from './transaction-categories';

afterEach(() => {
  setRuntimeThemeScheme('light');
});

describe('theme preference resolution', () => {
  it('accepts only supported preference values', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('midnight')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('falls back to system for invalid persisted values', () => {
    expect(normalizeThemePreference('dark')).toBe('dark');
    expect(normalizeThemePreference('light')).toBe('light');
    expect(normalizeThemePreference('bad-value')).toBe('system');
    expect(normalizeThemePreference(null)).toBe('system');
  });

  it('resolves system, light, and dark schemes', () => {
    expect(resolveThemeScheme('system', 'dark')).toBe('dark');
    expect(resolveThemeScheme('system', 'light')).toBe('light');
    expect(resolveThemeScheme('system', null)).toBe('light');
    expect(resolveThemeScheme('light', 'dark')).toBe('light');
    expect(resolveThemeScheme('dark', 'light')).toBe('dark');
  });

  it('keeps light and dark token sets addressable', () => {
    expect(THEME_PREFERENCE_STORAGE_KEY).toBe('happy-circles:theme-preference:v1');
    expect(themes.light.scheme).toBe('light');
    expect(themes.dark.scheme).toBe('dark');
    expect(themes.dark.colors.background).not.toBe(themes.light.colors.background);
  });

  it('keeps the legacy theme export aligned to the runtime scheme', () => {
    expect(theme.scheme).toBe('light');

    setRuntimeThemeScheme('dark');

    expect(theme.scheme).toBe('dark');
    expect(theme.colors.background).toBe(themes.dark.colors.background);
  });

  it('keeps shared visual resolvers aligned to the runtime scheme', () => {
    expect(transactionCategoryColor('cycle')).toBe(themes.light.colors.cycle);
    expect(cardStateColor('ready', 'cycle')).toBe(themes.light.colors.cycle);

    setRuntimeThemeScheme('dark');

    expect(transactionCategoryColor('cycle')).toBe(themes.dark.colors.cycle);
    expect(cardStateColor('ready', 'cycle')).toBe(themes.dark.colors.cycle);
  });
});
