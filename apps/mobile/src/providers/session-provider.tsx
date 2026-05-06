import type { PropsWithChildren } from 'react';
import { createContext, useContext } from 'react';

import { useSessionController } from './session-runtime/session-controller';
import type { SessionContextValue } from './session/types';

export type { SessionContextValue } from './session/types';

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const value = useSessionController();

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider.');
  }

  return context;
}
