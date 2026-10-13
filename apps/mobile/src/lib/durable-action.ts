import { createIdempotencyKey } from './idempotency';

export interface DurableActionStore {
  /** Atomically reuse a pending key, or replace a confirmed intention. */
  acquire(signature: string, candidateKey: string, retiredKey?: string): Promise<string>;
  /** A late acknowledgement must never retire a newer intention. */
  confirm(signature: string, key: string): Promise<void>;
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  throw new Error('La intención contiene datos no válidos.');
}

export function durableActionSignature(input: {
  readonly backendScope: string;
  readonly actorUserId: string;
  readonly operation: string;
  readonly payload: Readonly<Record<string, unknown>>;
}): string {
  if (!input.backendScope || !input.actorUserId || !input.operation) {
    throw new Error('No hay una cuenta y un servicio listos para guardar la operación.');
  }
  return JSON.stringify([
    input.backendScope,
    input.actorUserId,
    input.operation,
    canonicalValue(input.payload),
  ]);
}

export class DurableActionStorageError extends Error {
  readonly code = 'durable_action_storage_unavailable';

  constructor() {
    super('No pudimos guardar la operación de forma segura. Libera espacio e intenta nuevamente.');
    this.name = 'DurableActionStorageError';
  }
}

/** No action is replayed on startup: callers must explicitly submit or retry it. */
export class DurableActionRegistry {
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly retiredKeys = new Map<string, string>();

  constructor(private readonly store: DurableActionStore) {}

  run<T>(signature: string, prefix: string, execute: (key: string) => Promise<T>): Promise<T> {
    const inFlight = this.pending.get(signature);
    if (inFlight) return inFlight as Promise<T>;

    const pending = this.execute(signature, prefix, execute).finally(() => {
      if (this.pending.get(signature) === pending) this.pending.delete(signature);
    });
    this.pending.set(signature, pending);
    return pending;
  }

  private async execute<T>(
    signature: string,
    prefix: string,
    execute: (key: string) => Promise<T>,
  ): Promise<T> {
    let key: string;
    try {
      key = await this.store.acquire(
        signature,
        createIdempotencyKey(prefix),
        this.retiredKeys.get(signature),
      );
    } catch {
      // An unavailable or corrupt journal must never fall back to a new in-memory key.
      throw new DurableActionStorageError();
    }

    // Every failure, including cancellation and a lost response, retains the durable key.
    const result = await execute(key);
    this.retiredKeys.set(signature, key);
    try {
      await this.store.confirm(signature, key);
      if (this.retiredKeys.get(signature) === key) this.retiredKeys.delete(signature);
    } catch {
      // The command is committed. Keep a memory receipt so a subsequent explicit
      // intention replaces this key durably before sending. After a crash, an
      // unacknowledged journal entry is safely replayed with its original key.
    }
    return result;
  }
}
