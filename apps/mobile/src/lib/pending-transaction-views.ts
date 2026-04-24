import { getStoredItem, setStoredItem } from '@/lib/storage';

const SEEN_PENDING_TRANSACTION_IDS_KEY = 'happy_circles.seen_pending_transaction_ids';
const MAX_STORED_PENDING_TRANSACTION_IDS = 200;

function storageKey(userId: string | null): string {
  return userId
    ? `${SEEN_PENDING_TRANSACTION_IDS_KEY}.${userId}`
    : SEEN_PENDING_TRANSACTION_IDS_KEY;
}

function parseSeenPendingTransactionIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

export async function getSeenPendingTransactionIds(
  userId: string | null,
): Promise<ReadonlySet<string>> {
  return new Set(parseSeenPendingTransactionIds(await getStoredItem(storageKey(userId))));
}

export async function markPendingTransactionIdsSeen(
  userId: string | null,
  itemIds: readonly string[],
): Promise<void> {
  const nextIds = itemIds.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (nextIds.length === 0) {
    return;
  }

  const currentIds = parseSeenPendingTransactionIds(await getStoredItem(storageKey(userId)));
  const mergedIds = Array.from(new Set([...nextIds, ...currentIds])).slice(
    0,
    MAX_STORED_PENDING_TRANSACTION_IDS,
  );

  await setStoredItem(storageKey(userId), JSON.stringify(mergedIds));
}
