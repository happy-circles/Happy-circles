import { Redirect } from 'expo-router';

export default function LoginRoute() {
  return <Redirect href="/sign-in?mode=sign-in" />;
}
