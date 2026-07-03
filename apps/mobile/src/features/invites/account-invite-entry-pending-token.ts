import type { AccountInvitePreviewResult } from '@/lib/live-data';
import { clearPendingInviteIntentIfMatches, writePendingInviteIntent } from '@/lib/invite-intent';

import { accountInviteStatusMessage } from './account-invite-utils';

const INVITE_VALIDATION_FAILED_MESSAGE =
  'No pudimos validar esta invitacion. Pide una nueva para empezar.';

export async function rememberPendingAccountInviteToken(input: {
  readonly onInvalidToken: (message: string) => void;
  readonly pendingToken: string | null;
  readonly preview: AccountInvitePreviewResult | undefined;
  readonly refetchPreview: () => Promise<{
    readonly data?: AccountInvitePreviewResult;
    readonly error: Error | null;
  }>;
}): Promise<boolean> {
  if (!input.pendingToken) {
    return true;
  }

  let nextPreview = input.preview;
  if (!nextPreview) {
    const previewResult = await input.refetchPreview();
    if (previewResult.error) {
      input.onInvalidToken(previewResult.error.message);
      return false;
    }
    nextPreview = previewResult.data;
  }

  const nextBlockingMessage = nextPreview
    ? accountInviteStatusMessage(nextPreview.status, nextPreview.deliveryStatus)
    : INVITE_VALIDATION_FAILED_MESSAGE;

  if (nextBlockingMessage) {
    await clearPendingInviteIntentIfMatches({
      type: 'account_invite',
      token: input.pendingToken,
    });
    input.onInvalidToken(nextBlockingMessage);
    return false;
  }

  await writePendingInviteIntent({
    type: 'account_invite',
    token: input.pendingToken,
    source: 'account_invite_auth',
  });
  return true;
}
