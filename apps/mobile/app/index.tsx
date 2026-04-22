import { Redirect } from 'expo-router';

import { buildSetupAccountHref } from '@/lib/setup-account';
import { useSession } from '@/providers/session-provider';

export default function IndexRoute() {
  const { setupState, status } = useSession();

  if (status === 'loading') {
    return null;
  }

  return (
    <Redirect
      href={
        status === 'signed_out'
          ? '/join'
          : !setupState.requiredComplete
            ? buildSetupAccountHref(setupState.pendingRequiredSteps[0] ?? 'profile')
            : '/home'
      }
    />
  );
}
