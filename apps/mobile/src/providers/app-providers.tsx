import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/lib/query-client';
import { installGlobalErrorReporting } from '@/lib/support-errors';

import { SessionProvider } from './session-provider';

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => installGlobalErrorReporting(), []);

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
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
