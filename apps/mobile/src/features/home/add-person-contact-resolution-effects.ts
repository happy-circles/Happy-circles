import { useEffect, useRef } from 'react';

import { uniqueContactPhoneE164List } from '@/features/home/contacts-sheet-helpers';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';

type MutableRef<T> = {
  current: T;
};

export function useAddPersonContactResolutionEffects(input: {
  readonly userId: string | null;
  readonly resolutionEpoch: number;
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
  const processedContactsRef = useRef<readonly ContactCandidate[] | null>(null);
  const processedUserRef = useRef(input.userId);
  const processedEpochRef = useRef(input.resolutionEpoch);
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
    if (
      processedUserRef.current !== input.userId ||
      processedEpochRef.current !== input.resolutionEpoch ||
      !input.canReadContacts
    ) {
      processedContactsRef.current = null;
      processedUserRef.current = input.userId;
      processedEpochRef.current = input.resolutionEpoch;
    }
    if (!input.visible || !input.canReadContacts || !input.contacts.length) return;
    const previous = processedContactsRef.current;
    if (previous === input.contacts) return;
    const appended =
      previous &&
      previous.length <= input.contacts.length &&
      previous.every((contact, index) => input.contacts[index] === contact);
    const additions = appended ? input.contacts.slice(previous.length) : input.contacts;
    const timeout = setTimeout(() => {
      processedContactsRef.current = input.contacts;
      input.hydrateAndEnqueueResolutionPhones(
        input.scanRunIdRef.current,
        uniqueContactPhoneE164List(additions),
        'background',
      );
    }, 240);
    return () => clearTimeout(timeout);
  }, [
    input.userId,
    input.resolutionEpoch,
    input.canReadContacts,
    input.contacts,
    input.hydrateAndEnqueueResolutionPhones,
    input.scanRunIdRef,
    input.visible,
  ]);
}
