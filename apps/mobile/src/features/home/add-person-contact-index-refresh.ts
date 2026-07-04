import { useEffect } from 'react';

import {
  subscribeContactIndex,
  type ContactIndexReadResult,
} from '@/features/home/add-person-contact-index';

type MutableRef<T> = {
  current: T;
};

export function useAddPersonContactIndexRefresh(input: {
  readonly contactsReadLimit: number;
  readonly refreshContactIndexRef: MutableRef<() => Promise<ContactIndexReadResult | null>>;
  readonly searchValue: string;
  readonly userId: string | null | undefined;
  readonly visible: boolean;
}) {
  useEffect(() => {
    if (!input.visible || !input.userId) {
      return undefined;
    }

    const unsubscribe = subscribeContactIndex(input.userId, () => {
      void input.refreshContactIndexRef.current().catch(() => undefined);
    });

    void input.refreshContactIndexRef.current().catch(() => undefined);

    return unsubscribe;
  }, [input.refreshContactIndexRef, input.userId, input.visible]);

  useEffect(() => {
    if (!input.visible) {
      return undefined;
    }

    const timeout = setTimeout(
      () => {
        void input.refreshContactIndexRef.current().catch(() => undefined);
      },
      input.searchValue.trim().length > 0 ? 120 : 0,
    );

    return () => {
      clearTimeout(timeout);
    };
  }, [input.contactsReadLimit, input.refreshContactIndexRef, input.searchValue, input.visible]);
}
