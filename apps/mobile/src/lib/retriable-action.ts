import { createIdempotencyKey } from './idempotency';

/** Retain an intention after an ambiguous network failure, including component remounts. */
export class RetriableActionRegistry {
  private intentions = new Map<string, { key: string; pending?: Promise<unknown> }>();
  run<T>(signature: string, prefix: string, execute: (key: string) => Promise<T>): Promise<T> {
    const intention = this.intentions.get(signature) ?? { key: createIdempotencyKey(prefix) };
    if (intention.pending) return intention.pending as Promise<T>;
    this.intentions.set(signature, intention);
    const pending = execute(intention.key).then(
      (result) => {
        if (this.intentions.get(signature) === intention) this.intentions.delete(signature);
        return result;
      },
      (error: unknown) => {
        const status =
          typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
        if (
          status >= 400 &&
          status < 500 &&
          status !== 408 &&
          this.intentions.get(signature) === intention
        )
          this.intentions.delete(signature);
        intention.pending = undefined;
        throw error;
      },
    );
    intention.pending = pending;
    return pending;
  }

  forgetWhere(predicate: (signature: string) => boolean) {
    for (const signature of this.intentions.keys())
      if (predicate(signature)) this.intentions.delete(signature);
  }
}
