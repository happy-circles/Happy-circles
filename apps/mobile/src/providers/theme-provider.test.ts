import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  getStoredItem: vi.fn(),
  setStoredItem: vi.fn(),
}));

vi.mock('react-native', () => ({
  Appearance: {
    setColorScheme: vi.fn(),
  },
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  useColorScheme: () => 'light',
}));

vi.mock('@/lib/storage', () => storageMock);

import { THEME_PREFERENCE_STORAGE_KEY } from '@/lib/theme';
import { getStoredThemePreference, persistThemePreference } from './theme-provider';

describe('theme provider persistence helpers', () => {
  beforeEach(() => {
    storageMock.getStoredItem.mockReset();
    storageMock.setStoredItem.mockReset();
  });

  it('loads a persisted theme preference', async () => {
    storageMock.getStoredItem.mockResolvedValue('dark');

    await expect(getStoredThemePreference()).resolves.toBe('dark');
    expect(storageMock.getStoredItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY);
  });

  it('falls back to system for invalid stored values', async () => {
    storageMock.getStoredItem.mockResolvedValue('sepia');

    await expect(getStoredThemePreference()).resolves.toBe('system');
  });

  it('persists an explicit preference with the theme key', async () => {
    storageMock.setStoredItem.mockResolvedValue(undefined);

    await persistThemePreference('light');

    expect(storageMock.setStoredItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'light');
  });
});
