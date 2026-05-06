import { useSession } from '@/providers/session-provider';

import { guardSensitiveMutationAction } from './sensitive-action-check';

export function useSensitiveMutationGuard() {
  const session = useSession();

  return async (actionLabel: string) => {
    await guardSensitiveMutationAction(session, actionLabel);
  };
}
