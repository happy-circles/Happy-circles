import { useEffect, useRef } from 'react';

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
  readonly visible: boolean;
  readonly visibleResolutionPhonesRef: MutableRef<Set<string>>;
}) {
  const backgroundPhonesKeyRef = useRef('');
  const visiblePhonesKeyRef = useRef('');

  useEffect(() => {
    if (!input.visible || !input.canReadContacts || input.contactResolutionWindow.length === 0) {
      input.visibleResolutionPhonesRef.current = new Set();
      visiblePhonesKeyRef.current = '';
      return;
    }

    const visiblePhones = uniqueContactPhoneE164List(input.contactResolutionWindow);
    const visiblePhonesKey = visiblePhones.join('|');
    if (visiblePhonesKeyRef.current === visiblePhonesKey) {
      return undefined;
    }

    visiblePhonesKeyRef.current = visiblePhonesKey;
    input.visibleResolutionPhonesRef.current = new Set(visiblePhones);
    const timeout = setTimeout(() => {
      input.hydrateAndEnqueueResolutionPhones(input.scanRunIdRef.current, visiblePhones, 'visible');
    }, 0);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    input.canReadContacts,
    input.contactResolutionWindow,
    input.hydrateAndEnqueueResolutionPhones,
    input.scanRunIdRef,
    input.visible,
    input.visibleResolutionPhonesRef,
  ]);

  useEffect(() => {
    if (!input.visible || !input.canReadContacts || input.contacts.length === 0) {
      backgroundPhonesKeyRef.current = '';
      return undefined;
    }

    const backgroundPhones = uniqueContactPhoneE164List(input.contacts);
    const backgroundPhonesKey = backgroundPhones.join('|');
    if (backgroundPhonesKeyRef.current === backgroundPhonesKey) {
      return undefined;
    }

    backgroundPhonesKeyRef.current = backgroundPhonesKey;
    const timeout = setTimeout(() => {
      input.hydrateAndEnqueueResolutionPhones(
        input.scanRunIdRef.current,
        backgroundPhones,
        'background',
      );
    }, 240);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    input.canReadContacts,
    input.contacts,
    input.hydrateAndEnqueueResolutionPhones,
    input.scanRunIdRef,
    input.visible,
  ]);
}
