import { Redirect } from 'expo-router';

import { SessionLoadingScreen } from '@/components/session-loading-screen';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { useSession } from '@/providers/session-provider';

export default function IndexRoute() {
  const { setupState, status } = useSession();

  if (status === 'loading') {
    return <SessionLoadingScreen />;
  }

  return (
    <Redirect
      href={
        status === 'signed_out'
          ? '/join'
          : status === 'signed_in_locked'
            ? '/join'
            : !setupState.requiredComplete
              ? buildSetupAccountHref(setupState.pendingRequiredSteps[0] ?? 'profile')
              : '/home'
      }
    />
  );
}
