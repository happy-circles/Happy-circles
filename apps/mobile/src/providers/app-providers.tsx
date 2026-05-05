import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/lib/query-client';
import { installGlobalErrorReporting } from '@/lib/support-errors';

import { SessionProvider } from './session-provider';

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => installGlobalErrorReporting(), []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
