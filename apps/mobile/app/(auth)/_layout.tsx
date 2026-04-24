import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/providers/session-provider';

export default function AuthLayout() {
  const { isSignedIn, status } = useSession();

  if (status === 'loading') {
    return null;
  }

  if (isSignedIn) {
    return <Redirect href="/home" />;
  }

  return (
    <Stack
      screenOptions={{
        animationMatchesGesture: true,
        fullScreenGestureEnabled: false,
        gestureDirection: 'horizontal',
        gestureEnabled: true,
        headerShown: false,
      }}
    />
  );
}
