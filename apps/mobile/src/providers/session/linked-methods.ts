import type { Session } from '@supabase/supabase-js';
import type { AuthIdentity, IdentityProvider, LinkedMethods, UserProfileRow } from './types';

export function normalizeIdentityProvider(value: string | null | undefined): IdentityProvider {
  const normalized = value?.trim().toLocaleLowerCase('en-US');

  if (normalized === 'email') {
    return 'email';
  }

  if (normalized === 'google') {
    return 'google';
  }

  if (normalized === 'apple') {
    return 'apple';
  }

  if (normalized === 'phone') {
    return 'phone';
  }

  return normalized ? 'unknown' : 'unknown';
}

export function deriveLinkedMethods(input: {
  readonly session: Session | null;
  readonly profile: UserProfileRow | null;
  readonly identities: readonly AuthIdentity[];
}): LinkedMethods {
  const providerSet = new Set<string>();
  const user = input.session?.user as
    | {
        readonly app_metadata?: {
          readonly provider?: string | null;
          readonly providers?: readonly string[] | null;
        };
        readonly identities?: readonly AuthIdentity[] | null;
      }
    | undefined;

  for (const identity of input.identities) {
    const provider = identity.provider?.trim().toLocaleLowerCase('en-US');
    if (provider) {
      providerSet.add(provider);
    }
  }

  for (const identity of user?.identities ?? []) {
    const provider = identity.provider?.trim().toLocaleLowerCase('en-US');
    if (provider) {
      providerSet.add(provider);
    }
  }

  for (const provider of user?.app_metadata?.providers ?? []) {
    const normalized = provider?.trim().toLocaleLowerCase('en-US');
    if (normalized) {
      providerSet.add(normalized);
    }
  }

  const primaryProvider = user?.app_metadata?.provider?.trim().toLocaleLowerCase('en-US');
  if (primaryProvider) {
    providerSet.add(primaryProvider);
  }

  const providers = [...providerSet];

  return {
    hasEmailPassword: providers.includes('email'),
    hasGoogle: providers.includes('google'),
    hasApple: providers.includes('apple'),
    hasPhone: Boolean(input.profile?.phone_e164),
    providers,
  };
}
