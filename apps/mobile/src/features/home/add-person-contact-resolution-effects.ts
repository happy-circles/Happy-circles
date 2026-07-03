import { useEffect } from 'react';

import { uniqueContactPhoneE164List } from '@/features/home/contacts-sheet-helpers';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';

type MutableRef<T> = {
  current: T;
};

export function useAddPersonContactResolutionEffects(input: {
  readonly canReadContacts: boolean;
  readonly contactResolutionWindow: readonly ContactCandidate[];
  readonly contacts: readonly ContactCandidate[];
  readonly hydrateAndEnqueueResolutionPhones: (
    runId: number,
    phoneE164List: readonly string[],
    priority: 'visible' | 'background',
  ) => void;
  readonly scanRunIdRef: MutableRef<number>;
  readonly searchValue: string;
  readonly visible: boolean;
  readonly visibleResolutionPhonesRef: MutableRef<Set<string>>;
}) {
  useEffect(() => {
    if (!input.visible || !input.canReadContacts || input.contactResolutionWindow.length === 0) {
      input.visibleResolutionPhonesRef.current = new Set();
      return;
    }

    const visiblePhones = uniqueContactPhoneE164List(input.contactResolutionWindow);
    input.visibleResolutionPhonesRef.current = new Set(visiblePhones);
    const timeout = setTimeout(
      () => {
        input.hydrateAndEnqueueResolutionPhones(input.scanRunIdRef.current, visiblePhones, 'visible');
      },
      input.searchValue.trim().length > 0 ? 220 : 0,
    );

    return () => {
      clearTimeout(timeout);
    };
  }, [
    input.canReadContacts,
    input.contactResolutionWindow,
    input.hydrateAndEnqueueResolutionPhones,
    input.scanRunIdRef,
    input.searchValue,
    input.visible,
    input.visibleResolutionPhonesRef,
  ]);

  useEffect(() => {
    if (!input.visible || !input.canReadContacts || input.contacts.length === 0) {
      return undefined;
    }

    const backgroundPhones = uniqueContactPhoneE164List(input.contacts);
    const timeout = setTimeout(
      () => {
        input.hydrateAndEnqueueResolutionPhones(
          input.scanRunIdRef.current,
          backgroundPhones,
          'background',
        );
      },
      input.searchValue.trim().length > 0 ? 420 : 180,
    );

    return () => {
      clearTimeout(timeout);
    };
  }, [
    input.canReadContacts,
    input.contacts,
    input.hydrateAndEnqueueResolutionPhones,
    input.scanRunIdRef,
    input.searchValue,
    input.visible,
  ]);
}
