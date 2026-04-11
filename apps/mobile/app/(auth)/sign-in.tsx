import { useLocalSearchParams } from 'expo-router';

import { SignInScreen } from '@/features/auth/sign-in-screen';

export default function SignInRoute() {
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode =
    rawMode === 'sign-in' || rawMode === 'login'
      ? 'sign-in'
      : rawMode === 'register' || rawMode === 'create-account'
        ? 'register'
        : null;

  return <SignInScreen initialMode={initialMode} />;
}
