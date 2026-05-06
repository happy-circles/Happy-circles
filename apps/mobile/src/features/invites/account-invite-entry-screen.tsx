import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { useSession } from '@/providers/session-provider';
import { extractAccountInviteToken } from './account-invite-utils';
import { AccountSignInEntry } from './account-invite-entry-flow';
import { resolveAccountInviteEntryParams } from './account-invite-entry-helpers';

export function AccountInviteEntryScreen() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    preview?: string | string[];
    token?: string | string[];
  }>();
  const session = useSession();
  const rawModeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawPreviewParam = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  const rawTokenParam = Array.isArray(params.token) ? params.token[0] : params.token;
  const entryParams = useMemo(
    () =>
      resolveAccountInviteEntryParams({
        hasRememberedAccount: Boolean(session.rememberedAccount),
        isDev: __DEV__,
        rawModeParam,
        rawPreviewParam,
        rawTokenParam,
      }),
    [rawModeParam, rawPreviewParam, rawTokenParam, session.rememberedAccount],
  );

  return (
    <AccountSignInEntry
      autoUseRememberedAccount={entryParams.autoUseRememberedAccount}
      initialMode={entryParams.initialMode}
      initialSurface={entryParams.initialSurface}
      initialToken={entryParams.initialToken}
      isPreviewMode={entryParams.isPreviewMode}
    />
  );
}
