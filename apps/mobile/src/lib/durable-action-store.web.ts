import type { DurableActionStore } from './durable-action';

interface StoredIntention {
  readonly key: string;
  readonly status: 'pending' | 'confirmed';
}

const STORE_NAME = 'intentions';
let databasePromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('happy-circles-action-journal', 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onerror = () => reject(request.error ?? new Error('Action journal could not open.'));
      request.onblocked = () => reject(new Error('Action journal upgrade is blocked.'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
    }).catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function readIntention(value: unknown): StoredIntention | null {
  if (value === undefined) return null;
  if (
    value &&
    typeof value === 'object' &&
    'key' in value &&
    typeof value.key === 'string' &&
    value.key.length >= 8 &&
    'status' in value &&
    (value.status === 'pending' || value.status === 'confirmed')
  ) {
    return { key: value.key, status: value.status };
  }
  throw new Error('Invalid durable action journal.');
}

async function updateIntention(
  signature: string,
  update: (current: StoredIntention | null) => StoredIntention,
): Promise<StoredIntention> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(signature);
    let next: StoredIntention;
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Action journal write failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Action journal aborted.'));
    transaction.oncomplete = () => resolve(next);
    request.onsuccess = () => {
      try {
        next = update(readIntention(request.result));
        store.put(next, signature);
      } catch (error) {
        transaction.abort();
        reject(error instanceof Error ? error : new Error('Invalid action journal operation.'));
      }
    };
  });
}

export const durableActionStore: DurableActionStore = {
  async acquire(signature, candidateKey, retiredKey) {
    const intention = await updateIntention(signature, (current) => ({
      key: current?.status === 'pending' && current.key !== retiredKey ? current.key : candidateKey,
      status: 'pending',
    }));
    return intention.key;
  },
  async confirm(signature, key) {
    await updateIntention(signature, (current) => {
      if (!current) throw new Error('Missing durable action journal.');
      return current.key === key ? { key, status: 'confirmed' } : current;
    });
  },
};
