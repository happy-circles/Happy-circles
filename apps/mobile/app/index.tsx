import { Redirect } from 'expo-router';

import { SessionLoadingScreen } from '@/components/session-loading-screen';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { resolveRequiredSetupStep } from '@/lib/pre-home-routing';
import { useSession } from '@/providers/session-provider';

export default function IndexRoute() {
  const { setupState, status } = useSession();
  const setupStep = resolveRequiredSetupStep(setupState);

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
            : setupStep
              ? buildSetupAccountHref(setupStep)
              : '/home'
      }
    />
  );
}
