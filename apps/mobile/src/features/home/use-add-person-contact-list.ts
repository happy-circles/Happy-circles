import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { AppState } from 'react-native';
import {
  contactIndexRevision,
  readContactIndex,
  startContactIndexing,
  type ContactIndexReadResult,
  type ContactIndexStartReason,
} from './add-person-contact-index';
import { ContactIndexPager } from './contact-index-pager';
import { useAddPersonContactReadWindow } from './add-person-contact-read-window';
import { useAddPersonContactIndexRefresh } from './add-person-contact-index-refresh';
import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  writeWarmContactScanCache,
} from './add-person-contact-scan-cache';
import { uniqueContactPhoneE164List } from './contacts-sheet-helpers';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  activateContactDiscoveryRuntime,
  disposeContactDiscoveryRuntime,
  setContactDiscoveryKnownPhones,
  replaceContactDiscoveryKnownPhones,
} from '@/lib/contact-discovery-runtime';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { useAddPersonContactResolutionController } from './add-person-contact-resolution-controller';

type ResolutionBridge = Pick<
  ReturnType<typeof useAddPersonContactResolutionController>,
  | 'loadCachedTargetResolutionsForPhones'
  | 'resetResolutionState'
  | 'resolvePhoneStatusesNow'
  | 'scanRunIdRef'
  | 'setTargetCache'
  | 'targetCacheRef'
  | 'visibleResolutionPhonesRef'
>;

export function useAddPersonContactList({
  userId,
  searchValue,
  visible,
  busyKey,
  setBusyKey,
  setMessage,
  loadCachedTargetResolutionsForPhones,
  resetResolutionState,
  resolvePhoneStatusesNow,
  scanRunIdRef,
  setTargetCache,
  targetCacheRef,
  visibleResolutionPhonesRef,
}: ResolutionBridge & {
  userId: string | null;
  searchValue: string;
  visible: boolean;
  busyKey: string | null;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const warmSnapshot = readWarmContactScanCache(userId);
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<ContactsPermissionStatus>(warmSnapshot?.contactsPermissionStatus ?? 'undetermined');
  const [contacts, setContacts] = useState<readonly ContactCandidate[]>(
    warmSnapshot?.contacts ?? [],
  );
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsScanComplete, setContactsScanComplete] = useState(
    warmSnapshot?.scanComplete ?? false,
  );
  const [contactsLoadedCount, setContactsLoadedCount] = useState(warmSnapshot?.loadedCount ?? 0);
  const backgroundPagerRef = useRef(new ContactIndexPager());
  const lifecycleRef = useRef({
    userId,
    searchValue,
    permissionStatus: contactsPermissionStatus,
    canReadContacts: false,
  });
  lifecycleRef.current = {
    userId,
    searchValue,
    permissionStatus: contactsPermissionStatus,
    canReadContacts: canReadContactsPermissionStatus(contactsPermissionStatus),
  };
  const prunedRevisionRef = useRef(-1);
  const lastReadKeyRef = useRef('');
  const lastReadResultRef = useRef<ContactIndexReadResult | null>(null);
  const indexReadVersionRef = useRef(0);
  const refreshContactIndexRef = useRef<() => Promise<ContactIndexReadResult | null>>(
    async () => null,
  );
  useEffect(() => {
    prunedRevisionRef.current = -1;
    backgroundPagerRef.current.cancel();
    lastReadKeyRef.current = '';
    const cache = readWarmContactScanCache(userId);
    setContacts(cache?.contacts ?? []);
    setContactsPermissionStatus(cache?.contactsPermissionStatus ?? 'undetermined');
    setContactsLoadedCount(cache?.loadedCount ?? 0);
    setContactsScanComplete(cache?.scanComplete ?? false);
    return () => {
      indexReadVersionRef.current += 1;
      backgroundPagerRef.current.cancel();
    };
  }, [userId]);

  const canReadContacts = canReadContactsPermissionStatus(contactsPermissionStatus);

  const contactResolutionWindowRef = useRef<readonly ContactCandidate[]>([]);
  const firstContacts = contacts.slice(0, 60);
  if (
    firstContacts.length !== contactResolutionWindowRef.current.length ||
    firstContacts.some((contact, index) => contact !== contactResolutionWindowRef.current[index])
  ) {
    contactResolutionWindowRef.current = firstContacts;
  }
  const contactResolutionWindow = contactResolutionWindowRef.current;
  const {
    contactsReadLimit,
    hasMoreContactsToDisplay,
    requestMoreContacts,
    resetContactReadLimit,
    setContactsMatchingCount,
  } = useAddPersonContactReadWindow(contacts.length);

  const contactsReadLimitRef = useRef(contactsReadLimit);
  contactsReadLimitRef.current = contactsReadLimit;
  const writeWarmContactSnapshot = useCallback(
    (result: ContactIndexReadResult, rows: readonly ContactCandidate[], revision: number) => {
      if (!userId || !canReadContactsPermissionStatus(result.permissionStatus)) return;
      writeWarmContactScanCache({
        contacts: rows,
        contactsPermissionStatus: result.permissionStatus,
        targetCache: targetCacheRef.current,
        userId: userId,
        indexRevision: revision,
        readLimit: contactsReadLimitRef.current,
        loadedCount: result.loadedCount,
        matchingCount: result.matchingCount,
        scanComplete: result.status === 'ready',
      });
    },
    [userId, targetCacheRef],
  );
  const applyWarmContactSnapshot = useCallback(
    (permissionStatus: ContactsPermissionStatus) => {
      const cache = readWarmContactScanCache(userId);
      if (
        !cache ||
        !canReadContactsPermissionStatus(permissionStatus) ||
        cache.contactsPermissionStatus !== permissionStatus
      )
        return false;
      if (targetCacheRef.current !== cache.targetCache) setTargetCache(cache.targetCache);
      setContacts(cache.contacts);
      setContactsLoadedCount(cache.loadedCount ?? cache.contacts.length);
      setContactsMatchingCount(cache.matchingCount ?? cache.contacts.length);
      setContactsLoading(false);
      setContactsScanComplete(cache.scanComplete ?? true);
      return true;
    },
    [userId, setTargetCache, setContactsMatchingCount, targetCacheRef],
  );

  const hydrateLocalRows = useCallback(
    async (rows: readonly ContactCandidate[], revision: number) => {
      if (!userId || contactIndexRevision(userId) !== revision) return;
      await loadCachedTargetResolutionsForPhones(
        scanRunIdRef.current,
        uniqueContactPhoneE164List(rows),
      );
    },
    [userId, loadCachedTargetResolutionsForPhones, scanRunIdRef],
  );

  const reconcileCompleteIndex = useCallback(
    async (result: ContactIndexReadResult, revision: number) => {
      if (
        !userId ||
        result.status !== 'ready' ||
        result.contacts.length < result.matchingCount ||
        prunedRevisionRef.current === revision
      )
        return;
      await hydrateLocalRows(result.contacts, revision);
      if (
        lifecycleRef.current.userId !== userId ||
        !lifecycleRef.current.canReadContacts ||
        contactIndexRevision(userId) !== revision
      )
        return;
      prunedRevisionRef.current = revision;
      replaceContactDiscoveryKnownPhones(userId, uniqueContactPhoneE164List(result.contacts));
    },
    [userId, hydrateLocalRows],
  );

  const scheduleBackgroundPages = useCallback(
    (result: ContactIndexReadResult, revision: number) => {
      if (!userId || lifecycleRef.current.searchValue.trim()) return;
      let previousCount = result.contacts.length;
      backgroundPagerRef.current.start({
        userId,
        revision,
        result,
        shouldContinue: () =>
          lifecycleRef.current.userId === userId &&
          lifecycleRef.current.canReadContacts &&
          !lifecycleRef.current.searchValue.trim() &&
          AppState.currentState === 'active' &&
          contactIndexRevision(userId) === revision,
        readPage: (offset) => readContactIndex({ limit: 120, offset, userId }),
        onPage: async (next) => {
          setContacts(next.contacts);
          lastReadResultRef.current = next;
          writeWarmContactSnapshot(next, next.contacts, revision);
          const additions = next.contacts.slice(previousCount);
          previousCount = next.contacts.length;
          await hydrateLocalRows(additions, revision);
          await reconcileCompleteIndex(next, revision);
          if (
            lifecycleRef.current.userId === userId &&
            lifecycleRef.current.canReadContacts &&
            AppState.currentState === 'active' &&
            contactIndexRevision(userId) === revision
          ) {
            setContactDiscoveryKnownPhones(
              userId,
              uniqueContactPhoneE164List(additions),
              'background',
            );
          }
        },
      });
    },
    [userId, writeWarmContactSnapshot, hydrateLocalRows, reconcileCompleteIndex],
  );

  const refreshContactIndex = useCallback(async () => {
    if (!userId || !lifecycleRef.current.canReadContacts || AppState.currentState !== 'active')
      return null;
    const revision = contactIndexRevision(userId);
    const key = JSON.stringify([
      userId,
      revision,
      searchValue,
      contactsReadLimit,
      lifecycleRef.current.permissionStatus,
    ]);
    if (lastReadKeyRef.current === key && lastReadResultRef.current) {
      scheduleBackgroundPages(lastReadResultRef.current, revision);
      return lastReadResultRef.current;
    }
    const readVersion = ++indexReadVersionRef.current;
    const warm = !searchValue.trim() ? readWarmContactScanCache(userId) : null;
    if (
      warm?.indexRevision === revision &&
      warm.contactsPermissionStatus === lifecycleRef.current.permissionStatus &&
      (warm.readLimit ?? 120) >= contactsReadLimit
    ) {
      const result: ContactIndexReadResult = {
        contacts: warm.contacts,
        permissionStatus: warm.contactsPermissionStatus,
        loadedCount: warm.loadedCount ?? warm.contacts.length,
        matchingCount: warm.matchingCount ?? warm.contacts.length,
        lastCompletedAt: null,
        status: warm.scanComplete ? 'ready' : 'indexing',
      };
      lastReadKeyRef.current = key;
      lastReadResultRef.current = result;
      setContacts(warm.contacts);
      setContactsMatchingCount(result.matchingCount);
      scheduleBackgroundPages(result, revision);
      return result;
    }
    lastReadKeyRef.current = key;
    lastReadResultRef.current = null;
    try {
      const result = await readContactIndex({ limit: contactsReadLimit, searchValue, userId });
      if (indexReadVersionRef.current !== readVersion || contactIndexRevision(userId) !== revision)
        return null;
      if (
        !lifecycleRef.current.canReadContacts ||
        lifecycleRef.current.userId !== userId ||
        lifecycleRef.current.searchValue !== searchValue ||
        (result.permissionStatus !== 'undetermined' &&
          result.permissionStatus !== lifecycleRef.current.permissionStatus)
      ) {
        lastReadKeyRef.current = '';
        return null;
      }
      lastReadResultRef.current = result;
      setContacts(result.contacts);
      setContactsLoadedCount(result.loadedCount);
      setContactsMatchingCount(result.matchingCount);
      setContactsLoading(result.contacts.length === 0 && result.status === 'indexing');
      setContactsScanComplete(result.status === 'ready');
      void hydrateLocalRows(result.contacts, revision);
      if (!searchValue.trim()) {
        void reconcileCompleteIndex(result, revision);
        writeWarmContactSnapshot(result, result.contacts, revision);
        scheduleBackgroundPages(result, revision);
      }
      return result;
    } catch (error) {
      if (lastReadKeyRef.current === key) lastReadKeyRef.current = '';
      throw error;
    }
  }, [
    contactsReadLimit,
    searchValue,
    userId,
    setContactsMatchingCount,
    hydrateLocalRows,
    writeWarmContactSnapshot,
    scheduleBackgroundPages,
    contactsPermissionStatus,
    reconcileCompleteIndex,
  ]);
  useEffect(() => {
    refreshContactIndexRef.current = refreshContactIndex;
  }, [refreshContactIndex]);

  const loadContacts = useCallback(
    async (reason: ContactIndexStartReason = 'sheet_open') => {
      if (!userId) {
        setContacts([]);
        setContactsLoadedCount(0);
        setContactsMatchingCount(0);
        setContactsLoading(false);
        setContactsScanComplete(false);
        return;
      }

      try {
        const permissionStatus = await getContactsPermissionStatus();
        if (lifecycleRef.current.userId !== userId) return;
        lifecycleRef.current.canReadContacts = canReadContactsPermissionStatus(permissionStatus);
        lifecycleRef.current.permissionStatus = permissionStatus;
        setContactsPermissionStatus(permissionStatus);

        if (!canReadContactsPermissionStatus(permissionStatus)) {
          resetResolutionState();
          disposeContactDiscoveryRuntime(userId);
          prunedRevisionRef.current = -1;
          clearWarmContactScanCache(userId);
          backgroundPagerRef.current.cancel();
          indexReadVersionRef.current += 1;
          lastReadKeyRef.current = '';
          lastReadResultRef.current = null;
          setContacts([]);
          setContactsLoadedCount(0);
          setContactsMatchingCount(0);
          setContactsLoading(false);
          setContactsScanComplete(true);
          return;
        }

        if (lifecycleRef.current.userId !== userId || AppState.currentState !== 'active') return;
        const previousWarm = readWarmContactScanCache(userId);
        if (previousWarm && previousWarm.contactsPermissionStatus !== permissionStatus) {
          resetResolutionState();
          replaceContactDiscoveryKnownPhones(userId, []);
          prunedRevisionRef.current = -1;
          clearWarmContactScanCache(userId);
          setContacts([]);
          backgroundPagerRef.current.cancel();
          lastReadKeyRef.current = '';
        }
        activateContactDiscoveryRuntime(userId);
        const usedWarmSnapshot = applyWarmContactSnapshot(permissionStatus);
        const warm = readWarmContactScanCache(userId);
        if (
          reason === 'sheet_open' &&
          usedWarmSnapshot &&
          warm?.scanComplete &&
          warm.indexRevision === contactIndexRevision(userId)
        ) {
          const revision = contactIndexRevision(userId);
          scheduleBackgroundPages(
            {
              contacts: warm.contacts,
              permissionStatus: warm.contactsPermissionStatus,
              loadedCount: warm.loadedCount ?? warm.contacts.length,
              matchingCount: warm.matchingCount ?? warm.contacts.length,
              lastCompletedAt: null,
              status: warm.scanComplete ? 'ready' : 'indexing',
            },
            revision,
          );
          return;
        }
        const cachedResult = await refreshContactIndexRef.current();
        if (
          lifecycleRef.current.userId !== userId ||
          AppState.currentState !== 'active' ||
          !lifecycleRef.current.canReadContacts
        )
          return;
        setContactsLoading(
          cachedResult
            ? cachedResult.contacts.length === 0 && cachedResult.status !== 'ready'
            : !usedWarmSnapshot,
        );
        void startContactIndexing({
          permissionStatus,
          reason,
          userId: userId,
        }).catch(() => undefined);
      } catch (error) {
        setContactsLoading(false);
        setMessage(error instanceof Error ? error.message : 'No se pudo leer la agenda.');
      }
    },
    [
      applyWarmContactSnapshot,
      userId,
      setContactsMatchingCount,
      scheduleBackgroundPages,
      resetResolutionState,
    ],
  );

  async function handleRefreshContacts() {
    if (busyKey || !userId) {
      return;
    }

    setBusyKey('refresh-contacts');
    setMessage('Actualizando agenda y estados de Happy Circles.');

    try {
      const permissionStatus = await getContactsPermissionStatus();
      if (lifecycleRef.current.userId !== userId) return;
      lifecycleRef.current.canReadContacts = canReadContactsPermissionStatus(permissionStatus);
      lifecycleRef.current.permissionStatus = permissionStatus;
      setContactsPermissionStatus(permissionStatus);

      if (!canReadContactsPermissionStatus(permissionStatus)) {
        resetResolutionState();
        disposeContactDiscoveryRuntime(userId);
        prunedRevisionRef.current = -1;
        clearWarmContactScanCache(userId);
        backgroundPagerRef.current.cancel();
        indexReadVersionRef.current += 1;
        setContacts([]);
        setContactsLoadedCount(0);
        setContactsMatchingCount(0);
        setContactsLoading(false);
        setContactsScanComplete(true);
        setMessage('Necesitamos acceso a contactos para actualizar la agenda.');
        return;
      }

      if (AppState.currentState !== 'active') return;
      activateContactDiscoveryRuntime(userId);
      resetContactReadLimit();
      setContactsLoading(contacts.length === 0);
      await startContactIndexing({
        permissionStatus,
        reason: 'manual_refresh',
        userId: userId,
      });
      if (
        lifecycleRef.current.userId !== userId ||
        AppState.currentState !== 'active' ||
        !lifecycleRef.current.canReadContacts
      )
        return;
      await refreshContactIndexRef.current();
      if (
        lifecycleRef.current.userId !== userId ||
        AppState.currentState !== 'active' ||
        !lifecycleRef.current.canReadContacts
      )
        return;
      void resolvePhoneStatusesNow([...visibleResolutionPhonesRef.current]).catch(() => undefined);
      setMessage('Agenda actualizándose en segundo plano.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la agenda.');
    } finally {
      if (lifecycleRef.current.userId === userId) setBusyKey(null);
    }
  }

  useAddPersonContactIndexRefresh({
    contactsReadLimit,
    refreshContactIndexRef,
    searchValue,
    userId: userId,
    visible: visible && canReadContacts,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void loadContacts('app_active');
      else backgroundPagerRef.current.cancel();
    });
    return () => subscription.remove();
  }, [loadContacts]);

  return {
    contacts,
    canReadContacts,
    contactsLoadedCount,
    contactsLoading,
    contactsPermissionStatus,
    contactsScanComplete,
    contactResolutionWindow,
    hasMoreContactsToDisplay,
    requestMoreContacts,
    resetContactReadLimit,
    loadContacts,
    handleRefreshContacts,
    setContacts,
    setContactsPermissionStatus,
    setContactsLoading,
  };
}
