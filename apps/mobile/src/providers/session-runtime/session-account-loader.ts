import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import {
  getCurrentAppVersion,
  getCurrentDeviceName,
  getOrCreateDeviceId,
} from '@/lib/device-trust';
import type { supabase } from '@/lib/supabase';
import { readFunctionErrorDetails } from '@/lib/support-errors';
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
import { resolveUserIdentities } from './session-controller-helpers';
import {
  hasAuthenticationAfterRevocation,
  isDeviceSessionAuthorized,
} from './device-session-authorization';
import { trustCurrentSessionDevice } from './session-edge-action';
import {
  SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
  withSessionOperationTimeout,
} from './session-operation';

type SessionClient = NonNullable<typeof supabase>;

export interface LoadedSessionAccountState {
  readonly accountAccessState: AccountAccessState;
  readonly authProvider: IdentityProvider | null;
  readonly currentDeviceId: string;
  readonly deviceTrustState: DeviceTrustState;
  readonly isAuthorizedDeviceSession: boolean;
  readonly emailConfirmed: boolean;
  readonly linkedMethods: LinkedMethods;
  readonly profile: UserProfileRow;
  readonly profileCompletionState: ProfileCompletionState;
  readonly trustedDevices: readonly TrustedDeviceRow[];
}

interface LoadSessionAccountStateInput {
  readonly client: SessionClient;
  readonly nextSession: Session;
  readonly setLoadingStage: (stage: SessionLoadingStage) => void;
  readonly authorizeSession?: boolean;
  readonly allowRevokedAuthorization?: boolean;
}

async function persistCurrentTrustedDevice(input: {
  readonly client: SessionClient;
  readonly deviceId: string;
  readonly userId: string;
  readonly session: Session;
  readonly authorizeSession: boolean;
  readonly allowRevokedAuthorization: boolean;
}): Promise<TrustedDeviceRow> {
  const touchResult = await input.client.functions.invoke<{
    readonly deviceId: string;
    readonly lastSeenAt: string;
    readonly revokedAt: string | null;
    readonly trustedAt: string | null;
    readonly trustState: TrustedDeviceRow['trust_state'];
  }>('touch-current-device', {
    body: {
      appVersion: getCurrentAppVersion(),
      deviceId: input.deviceId,
      deviceName: getCurrentDeviceName(),
      platform: Platform.OS,
    },
    headers: { Authorization: `Bearer ${input.session.access_token}` },
  });

  if (touchResult.error) {
    const details = await readFunctionErrorDetails(touchResult.error);
    throw new Error(details.message);
  }

  const readDevice = async () => {
    const result = await input.client
      .from('trusted_devices')
      .select('*')
      .eq('user_id', input.userId)
      .eq('device_id', input.deviceId)
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data as TrustedDeviceRow;
  };
  const currentDevice = await readDevice();
  const revoked = currentDevice.trust_state === 'revoked' || currentDevice.revoked_at != null;
  const canAttemptRevokedSession =
    input.allowRevokedAuthorization ||
    hasAuthenticationAfterRevocation(input.session, currentDevice.revoked_at);
  if (
    !input.authorizeSession ||
    (revoked && !canAttemptRevokedSession) ||
    isDeviceSessionAuthorized(currentDevice, input.session)
  ) {
    return currentDevice;
  }

  // A server-read binding already authorizes this session. Only an unbound
  // session needs the endpoint; a refusal keeps account data available.
  try {
    const result = await withSessionOperationTimeout(
      'authorize-loaded-session',
      trustCurrentSessionDevice(input.client, input.deviceId, input.session.access_token),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    );
    if (result.ok) return await readDevice();
  } catch {
    // Retry at the intended action without blocking account loading on trust.
  }
  return currentDevice;
}

export async function loadSessionAccountState({
  client,
  nextSession,
  setLoadingStage,
  authorizeSession = true,
  allowRevokedAuthorization = false,
}: LoadSessionAccountStateInput): Promise<LoadedSessionAccountState> {
  setLoadingStage('device');
  const deviceId = await getOrCreateDeviceId();
  setLoadingStage('profile');
  const [profileResult, identities, currentDevice, authUserResult] = await Promise.all([
    client.rpc('get_current_user_private_profile'),
    resolveUserIdentities(client, nextSession),
    persistCurrentTrustedDevice({
      client,
      deviceId,
      userId: nextSession.user.id,
      session: nextSession,
      authorizeSession,
      allowRevokedAuthorization,
    }),
    client.auth.getUser(),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (authUserResult.error) {
    throw new Error(authUserResult.error.message);
  }

  const profile = (
    Array.isArray(profileResult.data) ? profileResult.data[0] : profileResult.data
  ) as UserProfileRow | null | undefined;
  if (!profile) {
    throw new Error('Current user profile was not found.');
  }
  if (profile.id !== nextSession.user.id || authUserResult.data.user?.id !== nextSession.user.id) {
    throw new Error('La sesión cambió durante la sincronización de la cuenta.');
  }
  const emailConfirmed = isAuthUserEmailConfirmed(authUserResult.data.user ?? nextSession.user);
  const accountAccessState = deriveAccountAccessState(profile);
  const linkedMethods = deriveLinkedMethods({
    identities,
    profile,
    session: nextSession,
  });
  const deviceTrustState = deriveDeviceTrustState(currentDevice);
  const isAuthorizedDeviceSession = isDeviceSessionAuthorized(currentDevice, nextSession);
  const profileCompletionState = deriveProfileCompletionState(profile, emailConfirmed);

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
    isAuthorizedDeviceSession,
    emailConfirmed,
    linkedMethods,
    profile,
    profileCompletionState,
    trustedDevices: devicesResult.data ?? [],
  };
}
