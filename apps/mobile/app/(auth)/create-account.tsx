import { Redirect } from 'expo-router';

export default function CreateAccountRoute() {
  return <Redirect href="/sign-in?mode=register" />;
}
