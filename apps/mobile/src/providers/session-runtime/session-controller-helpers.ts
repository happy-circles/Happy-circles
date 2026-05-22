import type { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';

import type { supabase } from '@/lib/supabase';
import type { AuthIdentity, StepUpAuthInput } from '../session/types';

type SessionClient = NonNullable<typeof supabase>;

export async function hashInviteTokenForRegistration(deliveryToken: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    deliveryToken.trim(),
  );

  return digest.toLocaleLowerCase('en-US');
}

export function normalizeStepUpAuthInput(input?: boolean | StepUpAuthInput): Required<
  Pick<StepUpAuthInput, 'force'>
> &
  Pick<StepUpAuthInput, 'password'> {
  if (typeof input === 'boolean') {
    return { force: input };
  }

  return {
    force: input?.force ?? false,
    password: input?.password,
  };
}

export async function revokeDuplicateActiveDeviceRows(input: {
  readonly client: SessionClient;
  readonly currentDeviceId: string;
  readonly deviceName: string | null;
  readonly platform: string;
  readonly timestamp: string;
  readonly userId: string;
}): Promise<void> {
  const deviceName = input.deviceName?.trim();
  if (!deviceName) {
    return;
  }

  const { error } = await input.client
    .from('trusted_devices')
    .update({
      trust_state: 'revoked',
      revoked_at: input.timestamp,
      last_seen_at: input.timestamp,
    } as never)
    .eq('user_id', input.userId)
    .eq('platform', input.platform)
    .eq('device_name', deviceName)
    .neq('device_id', input.currentDeviceId)
    .in('trust_state', ['pending', 'trusted']);

  if (error) {
    throw new Error(error.message);
  }
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
