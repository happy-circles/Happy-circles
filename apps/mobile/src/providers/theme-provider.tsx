import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { getStoredItem, setStoredItem } from '@/lib/storage';
import {
  normalizeThemePreference,
  resolveThemeScheme,
  setRuntimeThemeScheme,
  THEME_PREFERENCE_STORAGE_KEY,
  themes,
  type AppTheme,
  type ThemePreference,
  type ThemeScheme,
} from '@/lib/theme';

type ThemeContextValue = {
  readonly preference: ThemePreference;
  readonly scheme: ThemeScheme;
  readonly theme: AppTheme;
  readonly setPreference: (nextPreference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export async function getStoredThemePreference(): Promise<ThemePreference> {
  return normalizeThemePreference(await getStoredItem(THEME_PREFERENCE_STORAGE_KEY));
}

export async function persistThemePreference(nextPreference: ThemePreference): Promise<void> {
  await setStoredItem(THEME_PREFERENCE_STORAGE_KEY, nextPreference);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;

    void getStoredThemePreference().then((storedPreference) => {
      if (!cancelled) {
        setPreferenceState(storedPreference);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    await persistThemePreference(nextPreference);
  }, []);

  const scheme = resolveThemeScheme(
    preference,
    systemColorScheme === 'dark' ? 'dark' : 'light',
  );
  setRuntimeThemeScheme(scheme);

  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(preference === 'system' ? null : preference);
    }
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      setPreference,
      theme: themes[scheme],
    }),
    [preference, scheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('Theme hooks must be used inside ThemeProvider.');
  }

  return context;
}

export function useAppTheme(): AppTheme {
  return useThemeContext().theme;
}

export function useThemeScheme(): ThemeScheme {
  return useThemeContext().scheme;
}

export function useThemePreference() {
  const { preference, scheme, setPreference } = useThemeContext();

  return { preference, scheme, setPreference };
}
