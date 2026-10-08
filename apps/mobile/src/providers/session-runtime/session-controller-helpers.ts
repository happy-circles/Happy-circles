import type { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import type { supabase } from '@/lib/supabase';
import type { AuthIdentity } from '../session/types';
export { normalizeStepUpAuthInput } from './session-step-up-input';

type SessionClient = NonNullable<typeof supabase>;

export async function hashInviteTokenForRegistration(deliveryToken: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    deliveryToken.trim(),
  );

  return digest.toLocaleLowerCase('en-US');
}

export async function resolveUserIdentities(
  client: SessionClient | null,
  currentSession: Session,
): Promise<readonly AuthIdentity[]> {
  if (!client) {
    return [];
  }

  const authApi = client.auth as unknown as {
    readonly getUserIdentities?: () => Promise<{
      data?: { identities?: readonly AuthIdentity[] | null };
    }>;
  };

  if (typeof authApi.getUserIdentities === 'function') {
    try {
      const result = await authApi.getUserIdentities();
      return result.data?.identities ?? [];
    } catch {
      return [];
    }
  }

  const user = currentSession.user as { readonly identities?: readonly AuthIdentity[] | null };
  return user.identities ?? [];
}
