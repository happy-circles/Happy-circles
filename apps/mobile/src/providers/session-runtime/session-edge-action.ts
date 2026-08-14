import type { supabase } from '@/lib/supabase';
import { getCurrentAppVersion, getCurrentDeviceName } from '@/lib/device-trust';
import { Platform } from 'react-native';
import {
  createSupportId,
  readFunctionErrorDetails,
  withSupportCode,
} from '@/lib/support-errors';
import { readErrorMessage } from '../session/auth-errors';
import {
  SESSION_AUTH_OPERATION_TIMEOUT_MS,
  sessionOperationErrorMessage,
  withSessionOperationTimeout,
} from './session-operation';

type SessionClient = NonNullable<typeof supabase>;

export type SessionEdgeActionResult<T> =
  | { readonly data: T | null; readonly ok: true }
  | { readonly code?: string; readonly message: string; readonly ok: false };

export async function invokeSessionEdgeAction<T>(input: {
  readonly body: Record<string, unknown>;
  readonly client: SessionClient;
  readonly name: string;
  readonly operation?: string;
}): Promise<SessionEdgeActionResult<T>> {
  const supportId = createSupportId();
  try {
    const result = await withSessionOperationTimeout(
      input.operation ?? input.name,
      input.client.functions.invoke<T>(input.name, {
        body: input.body,
        headers: {
          'x-client-info': 'happy-circles-mobile',
          'x-request-id': supportId,
        },
      }),
      SESSION_AUTH_OPERATION_TIMEOUT_MS,
    );
    if (!result.error) {
      return { data: result.data, ok: true };
    }

    const details = await readFunctionErrorDetails(result.error);
    return {
      code: details.code,
      message: withSupportCode(details.message || readErrorMessage(result.error), supportId),
      ok: false,
    };
  } catch (error) {
    return {
      message: withSupportCode(
        sessionOperationErrorMessage(error, readErrorMessage(error)),
        supportId,
      ),
      ok: false,
    };
  }
}

export function trustCurrentSessionDevice(client: SessionClient, deviceId: string) {
  return invokeSessionEdgeAction({
    body: {
      appVersion: getCurrentAppVersion(),
      deviceId,
      deviceName: getCurrentDeviceName(),
      platform: Platform.OS,
    },
    client,
    name: 'trust-current-device',
  });
}
