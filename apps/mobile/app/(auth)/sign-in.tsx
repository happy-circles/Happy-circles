import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SignInRoute() {
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  if (rawMode === 'register' || rawMode === 'create-account') {
    return <Redirect href="/join" />;
  }

  if (rawMode === 'recover' || rawMode === 'forgot-password') {
    return <Redirect href="/join?mode=recover" />;
  }

  return <Redirect href="/join?mode=sign-in" />;
}
