import { Platform } from 'react-native';

import {
  reportSupportErrorSchema,
  type AnalyticsScreenName,
  type SupportErrorKind,
} from '@happy-circles/shared';

import { appConfig } from './config';
import { getCurrentAppVersion } from './device-trust';
import { supabase } from './supabase';

type SupportMetadata = Partial<
  Record<
    'action' | 'functionName' | 'operation' | 'reason' | 'result' | 'source' | 'status',
    string | number | boolean | null
  >
>;

export interface FunctionErrorDetails {
  readonly message: string;
  readonly code?: string;
  readonly requestId?: string;
  readonly status?: number;
}

interface SupportErrorInput {
  readonly message: string;
  readonly supportId: string;
  readonly code?: string | null;
  readonly requestId?: string | null;
  readonly status?: number;
  readonly functionName?: string | null;
}

interface ReportClientErrorInput {
  readonly kind: SupportErrorKind;
  readonly error?: unknown;
  readonly supportId?: string;
  readonly requestId?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly functionName?: string | null;
  readonly screenName?: AnalyticsScreenName | null;
  readonly route?: string | null;
  readonly fatal?: boolean;
  readonly metadata?: SupportMetadata;
}

interface GlobalErrorHandler {
  (error: Error, isFatal?: boolean): void;
}

interface ErrorUtilsLike {
  readonly getGlobalHandler?: () => GlobalErrorHandler;
  readonly setGlobalHandler?: (handler: GlobalErrorHandler) => void;
}

interface WebEventTargetLike {
  readonly addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  readonly removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
}

const UNKNOWN_SCREEN: AnalyticsScreenName = 'unknown';
const SUPPORT_ID_REGEX = /^HC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

let supportContext: {
  readonly route: string | null;
  readonly screenName: AnalyticsScreenName;
} = {
  route: null,
  screenName: UNKNOWN_SCREEN,
};

let globalErrorReportingInstalled = false;

export class SupportError extends Error {
  public readonly code?: string;
  public readonly functionName?: string;
  public readonly requestId?: string;
  public readonly status?: number;
  public readonly supportId: string;

  public constructor(input: SupportErrorInput) {
    super(withSupportCode(input.message, input.supportId));
    this.name = 'SupportError';
    this.supportId = input.supportId;
    this.code = input.code ?? undefined;
    this.requestId = input.requestId ?? undefined;
    this.status = input.status;
    this.functionName = input.functionName ?? undefined;
  }
}

export function createSupportId(): string {
  const source =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const normalized = source
    .replace(/[^a-zA-Z0-9]/g, '')
    .padEnd(12, '0')
    .slice(0, 12)
    .toUpperCase();

  return `HC-${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`;
}

export function setSupportErrorContext(context: {
  readonly route?: string | null;
  readonly screenName?: AnalyticsScreenName | null;
}): void {
  supportContext = {
    route: context.route?.slice(0, 120) ?? supportContext.route,
    screenName: context.screenName ?? supportContext.screenName,
  };
}

export function withSupportCode(message: string, supportId: string): string {
  const trimmed = message.trim() || 'No se pudo completar la accion.';

  if (!SUPPORT_ID_REGEX.test(supportId) || trimmed.includes(supportId)) {
    return trimmed;
  }

  return `${trimmed} Codigo de soporte: ${supportId}.`;
}

export function messageFromUnknownError(error: unknown, fallback = 'Unexpected error'): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return fallback;
}

export async function readFunctionErrorDetails(error: unknown): Promise<FunctionErrorDetails> {
  const fallbackMessage = messageFromUnknownError(error);
  const ResponseCtor = globalThis.Response;
  const maybeContext =
    error instanceof Error &&
    'context' in error &&
    typeof ResponseCtor === 'function' &&
    error.context instanceof ResponseCtor
      ? error.context
      : null;

  if (!maybeContext) {
    return { message: fallbackMessage };
  }

  const requestIdFromHeader = maybeContext.headers.get('x-request-id')?.trim() || undefined;

  try {
    const body = (await maybeContext.clone().json()) as {
      readonly code?: unknown;
      readonly error?: unknown;
      readonly message?: unknown;
      readonly requestId?: unknown;
    };
    const bodyMessage =
      typeof body.error === 'string' && body.error.trim().length > 0
        ? body.error.trim()
        : typeof body.message === 'string' && body.message.trim().length > 0
          ? body.message.trim()
          : fallbackMessage;

    return {
      code: typeof body.code === 'string' ? body.code.trim() || undefined : undefined,
      message:
        typeof body.code === 'string' && body.code === 'auth_required'
          ? `${body.code}: ${bodyMessage}`
          : bodyMessage,
      requestId:
        typeof body.requestId === 'string' && body.requestId.trim().length > 0
          ? body.requestId.trim()
          : requestIdFromHeader,
      status: maybeContext.status,
    };
  } catch {
    try {
      const text = await maybeContext.text();
      return {
        message: text.trim().length > 0 ? `${fallbackMessage}: ${text}` : fallbackMessage,
        requestId: requestIdFromHeader,
        status: maybeContext.status,
      };
    } catch {
      return {
        message: fallbackMessage,
        requestId: requestIdFromHeader,
        status: maybeContext.status,
      };
    }
  }
}

export function isJwtAuthError(details: FunctionErrorDetails | string): boolean {
  const normalized =
    typeof details === 'string'
      ? details.trim().toLocaleLowerCase('en-US')
      : `${details.code ?? ''} ${details.message}`.trim().toLocaleLowerCase('en-US');

  return (
    normalized.includes('invalid jwt') ||
    normalized.includes('jwt expired') ||
    normalized.includes('jwt malformed') ||
    normalized.includes('bad jwt') ||
    normalized.includes('auth_required') ||
    normalized.includes('missing authorization header')
  );
}

export function createSupportError(input: SupportErrorInput): SupportError {
  return new SupportError(input);
}

export function reportAndCreateSupportError(input: {
  readonly kind: SupportErrorKind;
  readonly error: unknown;
  readonly fallbackMessage?: string;
  readonly supportId?: string;
  readonly requestId?: string | null;
  readonly errorCode?: string | null;
  readonly functionName?: string | null;
  readonly status?: number;
  readonly metadata?: SupportMetadata;
}): SupportError {
  if (input.error instanceof SupportError) {
    return input.error;
  }

  const supportId = input.supportId ?? createSupportId();
  const message = messageFromUnknownError(input.error, input.fallbackMessage);

  reportClientErrorSafe({
    error: input.error,
    errorCode: input.errorCode,
    errorMessage: message,
    fatal: false,
    functionName: input.functionName,
    kind: input.kind,
    metadata: input.metadata,
    requestId: input.requestId,
    supportId,
  });

  return createSupportError({
    code: input.errorCode,
    functionName: input.functionName,
    message,
    requestId: input.requestId,
    status: input.status,
    supportId,
  });
}

async function getCurrentAccessToken(): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function reportClientError(input: ReportClientErrorInput): Promise<void> {
  if (!supabase || !appConfig.supabaseUrl || !appConfig.supabaseAnonKey) {
    return;
  }

  const supportId = input.supportId ?? createSupportId();
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) {
    return;
  }

  const metadata: SupportMetadata = {
    ...input.metadata,
    ...(input.functionName ? { functionName: input.functionName } : {}),
  };
  const payload = reportSupportErrorSchema.parse({
    appVersion: getCurrentAppVersion(),
    errorCode: input.errorCode ?? null,
    errorMessage: (input.errorMessage ?? messageFromUnknownError(input.error)).slice(0, 240),
    fatal: input.fatal ?? false,
    functionName: input.functionName ?? null,
    kind: input.kind,
    metadata,
    occurredAt: new Date().toISOString(),
    platform: Platform.OS,
    requestId: input.requestId ?? null,
    route: input.route ?? supportContext.route,
    screenName: input.screenName ?? supportContext.screenName,
    supportId,
  });

  await fetch(`${appConfig.supabaseUrl.replace(/\/+$/, '')}/functions/v1/report-client-error`, {
    body: JSON.stringify(payload),
    headers: {
      Accept: 'application/json',
      apikey: appConfig.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-client-info': 'happy-circles-mobile',
      'x-request-id': supportId,
    },
    method: 'POST',
  });
}

export function reportClientErrorSafe(input: ReportClientErrorInput): void {
  void reportClientError(input).catch(() => undefined);
}

function extractUnhandledError(event: unknown): unknown {
  if (!event || typeof event !== 'object') {
    return event;
  }

  if ('reason' in event) {
    return (event as { readonly reason?: unknown }).reason;
  }

  if ('error' in event) {
    return (event as { readonly error?: unknown }).error;
  }

  if ('message' in event) {
    return String((event as { readonly message?: unknown }).message);
  }

  return event;
}

export function installGlobalErrorReporting(): () => void {
  if (globalErrorReportingInstalled) {
    return () => undefined;
  }

  globalErrorReportingInstalled = true;

  const errorUtils = (globalThis as { readonly ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  const webTarget = globalThis as WebEventTargetLike;

  const handleGlobalError: GlobalErrorHandler = (error, isFatal) => {
    const supportId = createSupportId();
    reportClientErrorSafe({
      error,
      errorMessage: messageFromUnknownError(error, 'Unhandled client exception'),
      fatal: Boolean(isFatal),
      kind: 'client_exception',
      metadata: { source: 'global_js_handler' },
      supportId,
    });

    previousHandler?.(error, isFatal);
  };

  const handleUnhandledEvent = (event: unknown) => {
    const error = extractUnhandledError(event);
    reportClientErrorSafe({
      error,
      errorMessage: messageFromUnknownError(error, 'Unhandled browser exception'),
      fatal: false,
      kind: 'client_exception',
      metadata: { source: 'global_web_handler' },
    });
  };

  errorUtils?.setGlobalHandler?.(handleGlobalError);
  webTarget.addEventListener?.('error', handleUnhandledEvent);
  webTarget.addEventListener?.('unhandledrejection', handleUnhandledEvent);

  return () => {
    if (previousHandler) {
      errorUtils?.setGlobalHandler?.(previousHandler);
    }
    webTarget.removeEventListener?.('error', handleUnhandledEvent);
    webTarget.removeEventListener?.('unhandledrejection', handleUnhandledEvent);
    globalErrorReportingInstalled = false;
  };
}
