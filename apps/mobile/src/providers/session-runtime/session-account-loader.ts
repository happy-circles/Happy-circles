import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import {
  getCurrentAppVersion,
  getCurrentDeviceName,
  getOrCreateDeviceId,
} from '@/lib/device-trust';
import { readPendingInviteIntent } from '@/lib/invite-intent';
import { prefetchAppSnapshot } from '@/lib/live-data/app-snapshot-prefetch';
import type { supabase } from '@/lib/supabase';
import {
  deriveAccountAccessState,
  deriveDeviceTrustState,
  deriveProfileCompletionState,
  isAuthUserEmailConfirmed,
} from '../session/account-state';
import { deriveLinkedMethods, normalizeIdentityProvider } from '../session/linked-methods';
import type {
  AccountAccessState,
  DeviceTrustState,
  IdentityProvider,
  LinkedMethods,
  ProfileCompletionState,
  SessionLoadingStage,
  TrustedDeviceRow,
  UserProfileRow,
} from '../session/types';
import {
  resolveUserIdentities,
  revokeDuplicateActiveDeviceRows,
} from './session-controller-helpers';

type SessionClient = NonNullable<typeof supabase>;

export interface LoadedSessionAccountState {
  readonly accountAccessState: AccountAccessState;
  readonly authProvider: IdentityProvider | null;
  readonly currentDeviceId: string;
  readonly deviceTrustState: DeviceTrustState;
  readonly emailConfirmed: boolean;
  readonly linkedMethods: LinkedMethods;
  readonly profile: UserProfileRow;
  readonly profileCompletionState: ProfileCompletionState;
  readonly trustedDevices: readonly TrustedDeviceRow[];
}

interface LoadSessionAccountStateInput {
  readonly client: SessionClient;
  readonly isCurrentLoad: () => boolean;
  readonly nextSession: Session;
  readonly setLoadingStage: (stage: SessionLoadingStage) => void;
}

async function persistCurrentTrustedDevice(input: {
  readonly client: SessionClient;
  readonly deviceId: string;
  readonly timestamp: string;
  readonly userId: string;
}): Promise<TrustedDeviceRow> {
  const devicePatch = {
    platform: Platform.OS,
    device_name: getCurrentDeviceName(),
    app_version: getCurrentAppVersion(),
    last_seen_at: input.timestamp,
  };
  const devicePayload = {
    user_id: input.userId,
    device_id: input.deviceId,
    ...devicePatch,
  };

  const existingResult = await input.client
    .from('trusted_devices')
    .select('*')
    .eq('user_id', input.userId)
    .eq('device_id', input.deviceId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const existingDevice = existingResult.data as TrustedDeviceRow | null;
  if (existingDevice) {
    const updateResult = await input.client
      .from('trusted_devices')
      .update(devicePatch as never)
      .eq('id', existingDevice.id)
      .select('*')
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return updateResult.data as TrustedDeviceRow;
  }

  const insertResult = await input.client
    .from('trusted_devices')
    .insert(devicePayload as never)
    .select('*')
    .single();

  if (!insertResult.error) {
    return insertResult.data as TrustedDeviceRow;
  }

  if (!insertResult.error.message.includes('duplicate key')) {
    throw new Error(insertResult.error.message);
  }

  const retryUpdateResult = await input.client
    .from('trusted_devices')
    .update(devicePatch as never)
    .eq('user_id', input.userId)
    .eq('device_id', input.deviceId)
    .select('*')
    .single();

  if (retryUpdateResult.error) {
    throw new Error(retryUpdateResult.error.message);
  }

  return retryUpdateResult.data as TrustedDeviceRow;
}

export async function loadSessionAccountState({
  client,
  isCurrentLoad,
  nextSession,
  setLoadingStage,
}: LoadSessionAccountStateInput): Promise<LoadedSessionAccountState> {
  setLoadingStage('device');
  const deviceId = await getOrCreateDeviceId();
  const timestamp = new Date().toISOString();

  setLoadingStage('profile');
  const [profileResult, identities, currentDevice, pendingInviteIntent, authUserResult] =
    await Promise.all([
      client
        .from('user_profiles')
        .select(
          'id, email, display_name, avatar_path, account_access_state, invited_by_user_id, activated_via_account_invite_id, activated_at, phone_country_iso2, phone_country_calling_code, phone_national_number, phone_e164, phone_verified_at, created_at, updated_at, deleted_at, deletion_requested_at, onboarding_completed_at, welcome_email_last_error, welcome_email_queued_at, welcome_email_sent_at',
        )
        .eq('id', nextSession.user.id)
        .single(),
      resolveUserIdentities(client, nextSession),
      persistCurrentTrustedDevice({
        client,
        deviceId,
        timestamp,
        userId: nextSession.user.id,
      }),
      readPendingInviteIntent(),
      client.auth.getUser(),
    ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (authUserResult.error) {
    throw new Error(authUserResult.error.message);
  }

  const profile = profileResult.data;
  const emailConfirmed = isAuthUserEmailConfirmed(authUserResult.data.user ?? nextSession.user);
  const derivedAccountAccessState = deriveAccountAccessState(profile);
  const accountAccessState =
    derivedAccountAccessState === 'needs_invite' && pendingInviteIntent?.type === 'account_invite'
      ? 'needs_activation'
      : derivedAccountAccessState;
  const linkedMethods = deriveLinkedMethods({
    identities,
    profile,
    session: nextSession,
  });
  const deviceTrustState = deriveDeviceTrustState(currentDevice);
  const profileCompletionState = deriveProfileCompletionState(profile, emailConfirmed);

  if (currentDevice.trust_state === 'trusted') {
    try {
      await revokeDuplicateActiveDeviceRows({
        client,
        currentDeviceId: deviceId,
        deviceName: currentDevice.device_name,
        platform: currentDevice.platform,
        timestamp,
        userId: nextSession.user.id,
      });
    } catch (error) {
      console.warn(
        'Failed to revoke duplicate trusted devices during account load',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (
    isCurrentLoad() &&
    accountAccessState === 'active' &&
    emailConfirmed &&
    profileCompletionState === 'complete' &&
    deviceTrustState === 'trusted'
  ) {
    void prefetchAppSnapshot(nextSession.user.id).catch(() => undefined);
  }

  setLoadingStage('device');
  const devicesResult = await client
    .from('trusted_devices')
    .select('*')
    .eq('user_id', nextSession.user.id)
    .neq('trust_state', 'revoked')
    .order('created_at', { ascending: false });

  if (devicesResult.error) {
    throw new Error(devicesResult.error.message);
  }

  return {
    accountAccessState,
    authProvider: normalizeIdentityProvider(nextSession.user.app_metadata?.provider ?? null),
    currentDeviceId: deviceId,
    deviceTrustState,
    emailConfirmed,
    linkedMethods,
    profile,
    profileCompletionState,
    trustedDevices: devicesResult.data ?? [],
  };
}
