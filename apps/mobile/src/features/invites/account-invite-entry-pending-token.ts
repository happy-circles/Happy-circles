import { useRef } from 'react';

import type { AccountInvitePreviewResult } from '@/lib/live-data';
import { clearPendingInviteIntentIfMatches, writePendingInviteIntent } from '@/lib/invite-intent';

import {
  MIN_ACCOUNT_INVITE_TOKEN_LENGTH,
  accountInviteStatusMessage,
  extractAccountInviteToken,
} from './account-invite-utils';

const INVITE_VALIDATION_FAILED_MESSAGE =
  'No pudimos validar esta invitación. Revisa tu conexión e intenta de nuevo.';
const INVITE_CLEANUP_FAILED_MESSAGE =
  'No pudimos limpiar la invitación anterior. Intenta de nuevo.';
const INVITE_CHANGED_DURING_SIGN_IN_MESSAGE =
  'La invitación cambió mientras iniciabas sesión. Intenta continuar de nuevo.';

class PendingAccountInviteCleanupError extends Error {}

export type PendingAccountInviteTokenPreparation = 'absent' | 'ignored' | 'remembered' | 'stale';

export interface PendingAccountInviteTokenPreparationAttempt {
  readonly token: string | null;
  readonly version: number;
}

interface PendingAccountInviteTokenPreparationInput {
  readonly pendingToken: string | null;
  readonly preview: AccountInvitePreviewResult | undefined;
  readonly refetchPreview: () => Promise<{
    readonly data?: AccountInvitePreviewResult;
    readonly error: Error | null;
  }>;
}

export function createPendingAccountInviteTokenPreparationGuard(initialToken: string | null) {
  let currentToken = initialToken;
  let latestInput: PendingAccountInviteTokenPreparationInput | null = null;
  let preparationQueue = Promise.resolve();
  let version = 0;

  return {
    begin(token: string | null): PendingAccountInviteTokenPreparationAttempt {
      version += 1;
      return { token, version };
    },
    isCurrent(attempt: PendingAccountInviteTokenPreparationAttempt): boolean {
      return attempt.version === version && attempt.token === currentToken;
    },
    latestInput(): PendingAccountInviteTokenPreparationInput | null {
      return latestInput;
    },
    replaceInput(value: string): void {
      const token = extractAccountInviteToken(value);
      const nextToken = token.length >= MIN_ACCOUNT_INVITE_TOKEN_LENGTH ? token : null;
      if (nextToken !== currentToken) {
        currentToken = nextToken;
        version += 1;
      }
    },
    replaceToken(token: string | null): void {
      if (token !== currentToken) {
        currentToken = token;
        version += 1;
      }
    },
    updateLatestInput(input: PendingAccountInviteTokenPreparationInput): void {
      latestInput = input;
      if (input.pendingToken !== currentToken) {
        currentToken = input.pendingToken;
        version += 1;
      }
    },
    runExclusive<T>(operation: () => Promise<T>): Promise<T> {
      const result = preparationQueue.then(operation, operation);
      preparationQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

export function usePendingAccountInviteTokenPreparation(
  input: PendingAccountInviteTokenPreparationInput & { readonly onIgnored: () => void },
) {
  const guard = useRef(createPendingAccountInviteTokenPreparationGuard(input.pendingToken)).current;
  guard.updateLatestInput(input);

  return {
    prepare: async () => {
      const attempt = await prepareCurrentPendingAccountInviteTokenForSignIn({
        ...input,
        guard,
      });
      if (!attempt) throw new Error(INVITE_CHANGED_DURING_SIGN_IN_MESSAGE);
      return attempt;
    },
    reconcile: (authenticatedAttempt: PendingAccountInviteTokenPreparationAttempt) =>
      reconcilePendingAccountInviteTokenAfterSignIn({
        authenticatedAttempt,
        guard,
        onIgnored: input.onIgnored,
      }),
    replaceInput: (value: string) => guard.replaceInput(value),
  };
}

async function prepareAttemptWithinQueue(input: {
  readonly attempt: PendingAccountInviteTokenPreparationAttempt;
  readonly guard: ReturnType<typeof createPendingAccountInviteTokenPreparationGuard>;
  readonly onIgnored?: () => void;
  readonly preparationInput: PendingAccountInviteTokenPreparationInput;
}): Promise<PendingAccountInviteTokenPreparationAttempt | null> {
  try {
    const result = await preparePendingAccountInviteTokenForSignIn({
      ...input.preparationInput,
      isCurrent: () => input.guard.isCurrent(input.attempt),
    });
    if (result === 'stale') return null;
    if (!input.guard.isCurrent(input.attempt)) return null;
    if (result === 'ignored') {
      input.guard.replaceToken(null);
      input.onIgnored?.();
      return input.guard.begin(null);
    }
    return input.attempt;
  } catch (error) {
    if (error instanceof PendingAccountInviteCleanupError) throw error;
    if (!input.guard.isCurrent(input.attempt)) return null;
    throw error;
  }
}

export async function prepareCurrentPendingAccountInviteTokenForSignIn(input: {
  readonly guard: ReturnType<typeof createPendingAccountInviteTokenPreparationGuard>;
  readonly onIgnored?: () => void;
  readonly pendingToken: string | null;
  readonly preview: AccountInvitePreviewResult | undefined;
  readonly refetchPreview: () => Promise<{
    readonly data?: AccountInvitePreviewResult;
    readonly error: Error | null;
  }>;
}): Promise<PendingAccountInviteTokenPreparationAttempt | null> {
  const attempt = input.guard.begin(input.pendingToken);
  return input.guard.runExclusive(async () => {
    if (!input.guard.isCurrent(attempt)) return null;
    return prepareAttemptWithinQueue({
      attempt,
      guard: input.guard,
      onIgnored: input.onIgnored,
      preparationInput: input,
    });
  });
}

export async function reconcilePendingAccountInviteTokenAfterSignIn(input: {
  readonly authenticatedAttempt: PendingAccountInviteTokenPreparationAttempt;
  readonly guard: ReturnType<typeof createPendingAccountInviteTokenPreparationGuard>;
  readonly onIgnored?: () => void;
}): Promise<PendingAccountInviteTokenPreparationAttempt> {
  return input.guard.runExclusive(async () => {
    if (input.guard.isCurrent(input.authenticatedAttempt)) return input.authenticatedAttempt;
    if (input.authenticatedAttempt.token) await clearPendingToken(input.authenticatedAttempt.token);

    const preparationInput = input.guard.latestInput();
    if (!preparationInput) throw new Error(INVITE_CHANGED_DURING_SIGN_IN_MESSAGE);
    const attempt = input.guard.begin(preparationInput.pendingToken);
    const preparedAttempt = await prepareAttemptWithinQueue({
      attempt,
      guard: input.guard,
      onIgnored: input.onIgnored,
      preparationInput,
    });
    if (!preparedAttempt || !input.guard.isCurrent(preparedAttempt)) {
      throw new Error(INVITE_CHANGED_DURING_SIGN_IN_MESSAGE);
    }
    return preparedAttempt;
  });
}

async function clearPendingToken(token: string): Promise<void> {
  try {
    await clearPendingInviteIntentIfMatches({ type: 'account_invite', token });
  } catch {
    throw new PendingAccountInviteCleanupError(INVITE_CLEANUP_FAILED_MESSAGE);
  }
}

async function ignorePendingToken(token: string): Promise<PendingAccountInviteTokenPreparation> {
  await clearPendingToken(token);
  return 'ignored';
}

export async function preparePendingAccountInviteTokenForSignIn(input: {
  readonly isCurrent?: () => boolean;
  readonly pendingToken: string | null;
  readonly preview: AccountInvitePreviewResult | undefined;
  readonly refetchPreview: () => Promise<{
    readonly data?: AccountInvitePreviewResult;
    readonly error: Error | null;
  }>;
}): Promise<PendingAccountInviteTokenPreparation> {
  if (!input.pendingToken) {
    return 'absent';
  }
  const isCurrent = input.isCurrent ?? (() => true);
  if (!isCurrent()) return 'stale';

  let nextPreview = input.preview;
  if (!nextPreview) {
    let previewResult: Awaited<ReturnType<typeof input.refetchPreview>>;
    try {
      previewResult = await input.refetchPreview();
    } catch {
      throw new Error(INVITE_VALIDATION_FAILED_MESSAGE);
    }
    if (previewResult.error) {
      throw new Error(INVITE_VALIDATION_FAILED_MESSAGE);
    }
    nextPreview = previewResult.data;
  }

  if (!nextPreview) {
    throw new Error(INVITE_VALIDATION_FAILED_MESSAGE);
  }

  const nextBlockingMessage = accountInviteStatusMessage(
    nextPreview.status,
    nextPreview.deliveryStatus,
  );

  if (nextBlockingMessage) {
    if (!isCurrent()) return 'stale';
    return ignorePendingToken(input.pendingToken);
  }

  if (!isCurrent()) return 'stale';
  await writePendingInviteIntent({
    type: 'account_invite',
    token: input.pendingToken,
    source: 'account_invite_auth',
  });
  if (!isCurrent()) {
    await clearPendingToken(input.pendingToken);
    return 'stale';
  }
  return 'remembered';
}
