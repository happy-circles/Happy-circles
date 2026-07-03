import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import {
  CONTACT_INDEX_INITIAL_READ_LIMIT,
  CONTACT_INDEX_READ_PAGE_SIZE,
} from '@/features/home/contacts-sheet-helpers';

export function useAddPersonContactReadWindow(contactCount: number): {
  readonly contactsReadLimit: number;
  readonly hasMoreContactsToDisplay: boolean;
  readonly requestMoreContacts: () => void;
  readonly resetContactReadLimit: () => void;
  readonly setContactsMatchingCount: Dispatch<SetStateAction<number>>;
} {
  const [contactsMatchingCount, setContactsMatchingCount] = useState(0);
  const [contactsReadLimit, setContactsReadLimit] = useState(CONTACT_INDEX_INITIAL_READ_LIMIT);
  const lastContactReadLimitIncreaseAtRef = useRef(0);

  const resetContactReadLimit = useCallback(() => {
    lastContactReadLimitIncreaseAtRef.current = 0;
    setContactsReadLimit(CONTACT_INDEX_INITIAL_READ_LIMIT);
  }, []);

  const requestMoreContacts = useCallback(() => {
    const now = Date.now();
    if (now - lastContactReadLimitIncreaseAtRef.current < 160) {
      return;
    }

    lastContactReadLimitIncreaseAtRef.current = now;
    setContactsReadLimit((current) => {
      if (contactsMatchingCount <= current) {
        return current;
      }

      return Math.min(current + CONTACT_INDEX_READ_PAGE_SIZE, contactsMatchingCount);
    });
  }, [contactsMatchingCount]);

  return {
    contactsReadLimit,
    hasMoreContactsToDisplay: contactCount < contactsMatchingCount,
    requestMoreContacts,
    resetContactReadLimit,
    setContactsMatchingCount,
  };
}
