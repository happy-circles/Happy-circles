import { Redirect } from 'expo-router';

import { useSession } from '@/providers/session-provider';

export default function IndexRoute() {
  const { status } = useSession();

  if (status === 'loading') {
    return null;
  }

  return <Redirect href={status === 'signed_out' ? '/sign-in' : '/home'} />;
}
