import { useEffect, useRef } from 'react';

import {
  registerCorrectionPrefillKey,
  type buildCorrectionDraft,
  type RegisterMode,
} from './register-flow-helpers';

export function useRegisterCorrectionPrefill(input: {
  readonly mode: RegisterMode;
  readonly personId: string;
  readonly requestId: string;
  readonly draft: ReturnType<typeof buildCorrectionDraft> | null;
  readonly onPrefill: (draft: ReturnType<typeof buildCorrectionDraft>) => void;
}) {
  const previousKey = useRef<string | null>(null);
  const { mode, personId, requestId, draft, onPrefill } = input;

  useEffect(() => {
    if (mode === 'create') {
      previousKey.current = null;
      return;
    }
    if (!draft) return;
    const nextKey = registerCorrectionPrefillKey({ mode, personId, requestId });
    if (previousKey.current === nextKey) return;
    previousKey.current = nextKey;
    onPrefill(draft);
  }, [draft, mode, onPrefill, personId, requestId]);
}
