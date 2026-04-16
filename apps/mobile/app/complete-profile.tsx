import { Redirect, useLocalSearchParams } from 'expo-router';

import { buildSetupAccountHref, resolveLegacyCompleteProfileStep } from '@/lib/setup-account';

export default function CompleteProfileRoute() {
  const params = useLocalSearchParams<{ focus?: string | string[] }>();
  const rawFocus = Array.isArray(params.focus) ? params.focus[0] : params.focus;

  return <Redirect href={buildSetupAccountHref(resolveLegacyCompleteProfileStep(rawFocus ?? null))} />;
}
