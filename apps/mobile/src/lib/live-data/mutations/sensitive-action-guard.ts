import { useRef } from 'react';

import { useIdentityConfirmation } from '@/providers/identity-confirmation-provider';
import { useSession } from '@/providers/session-provider';

import { runAuthorizedMutationAction } from './sensitive-action-check';

export function useSensitiveMutationGuard() {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { confirmIdentity } = useIdentityConfirmation();

  return async <T>(
    actionLabel: string,
    action: (expectedUserId: string) => Promise<T>,
    forceConfirmation?: 'device' | 'sensitive',
  ): Promise<T> =>
    runAuthorizedMutationAction({
      actionLabel,
      readSession: () => sessionRef.current,
      confirmIdentity,
      action,
      forceConfirmation,
    });
}
