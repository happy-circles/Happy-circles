import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/lib/query-client';
import { installGlobalErrorReporting } from '@/lib/support-errors';
import { ThemeProvider, useAppTheme } from './theme-provider';

import { SessionProvider } from './session-provider';

function AppProvidersContent({ children }: PropsWithChildren) {
  const activeTheme = useAppTheme();

  useEffect(() => installGlobalErrorReporting(), []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }

    const root = document.getElementById('root');
    const backgroundColor = activeTheme.colors.background;
    document.documentElement.style.backgroundColor = backgroundColor;
    document.documentElement.style.margin = '0';
    document.documentElement.style.minHeight = '100%';
    document.body.style.backgroundColor = backgroundColor;
    document.body.style.margin = '0';
    document.body.style.minHeight = '100%';
    root?.style.setProperty('background-color', backgroundColor);
    root?.style.setProperty('min-height', '100%');

    return undefined;
  }, [activeTheme.colors.background]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }

    focusManager.setEventListener((setFocused) => {
      setFocused(AppState.currentState === 'active');

      const subscription = AppState.addEventListener('change', (nextState) => {
        setFocused(nextState === 'active');
      });

      return () => {
        subscription.remove();
      };
    });

    return undefined;
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppProvidersContent>{children}</AppProvidersContent>
    </ThemeProvider>
  );
}
