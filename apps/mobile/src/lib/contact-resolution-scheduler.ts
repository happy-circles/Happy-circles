import type { PeopleTargetResolution } from './live-data/types-runtime';

export type ContactResolutionPriority = 'background' | 'visible' | 'event' | 'interactive';
type Waiter<Row> = {
  resolve: (row: Row | undefined) => void;
  reject: (error: unknown) => void;
};
type Job<Row> = { phone: string; priority: ContactResolutionPriority; waiters: Waiter<Row>[] };
const priorityRank = { interactive: 0, event: 1, visible: 2, background: 3 };

/** One budget and deduplication queue for every resolution entry point of a user. */
export class ContactResolutionScheduler<
  Row extends { readonly phoneE164: string } = PeopleTargetResolution,
> {
  private jobs = new Map<string, Job<Row>>();
  private active = new Map<string, Job<Row>>();
  private running = false;
  private calls: number[] = [];
  private retryAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fetchBatch: (phones: readonly string[]) => Promise<readonly Row[]>,
    private readonly minuteLimits = { background: 45, visible: 45, event: 55, interactive: 60 },
  ) {}

  request(
    phones: readonly string[],
    priority: ContactResolutionPriority,
    afterCurrent = false,
  ): Promise<readonly Row[]> {
    const promises = [...new Set(phones)].map(
      (phone) =>
        new Promise<Row | undefined>((resolve, reject) => {
          const existing =
            this.jobs.get(phone) ?? (afterCurrent ? undefined : this.active.get(phone));
          if (existing) {
            if (priorityRank[priority] < priorityRank[existing.priority])
              existing.priority = priority;
            existing.waiters.push({ resolve, reject });
          } else {
            this.jobs.set(phone, { phone, priority, waiters: [{ resolve, reject }] });
          }
        }),
    );
    this.schedule(0);
    return Promise.all(promises).then((rows) => rows.filter((row) => row !== undefined) as Row[]);
  }

  private schedule(delay: number) {
    if (this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, delay);
  }

  private async pump() {
    if (this.running || this.jobs.size === 0) return;
    const now = Date.now();
    this.calls = this.calls.filter((at) => now - at < 3_600_000);
    const sorted = [...this.jobs.values()].sort(
      (a, b) => priorityRank[a.priority] - priorityRank[b.priority],
    );
    const interactive = sorted[0].priority === 'interactive';
    const event = sorted[0].priority === 'event';
    const minuteCalls = this.calls.filter((at) => now - at < 60_000);
    const minuteLimit = this.minuteLimits[sorted[0].priority];
    const hourLimit = interactive ? 1200 : event ? 1100 : 1000;
    const resumeAt = Math.max(
      this.retryAt,
      minuteCalls.length >= minuteLimit
        ? minuteCalls[minuteCalls.length - minuteLimit] + 60_001
        : 0,
      this.calls.length >= hourLimit ? this.calls[this.calls.length - hourLimit] + 3_600_001 : 0,
    );
    if (resumeAt > now) {
      this.schedule(resumeAt - now);
      return;
    }
    const batch = sorted.slice(0, 60);
    for (const job of batch) {
      this.jobs.delete(job.phone);
      this.active.set(job.phone, job);
    }
    this.running = true;
    this.calls.push(now);
    try {
      const rows = await this.fetchBatch(batch.map((job) => job.phone));
      const byPhone = new Map(rows.map((row) => [row.phoneE164, row]));
      for (const job of batch)
        for (const waiter of job.waiters) waiter.resolve(byPhone.get(job.phone));
    } catch (error) {
      // A failed read is never cached as "no account". Leave stale data visible.
      const retryAfter =
        typeof error === 'object' && error !== null && 'retryAfterSeconds' in error
          ? Number(error.retryAfterSeconds)
          : 30;
      this.retryAt =
        Date.now() + Math.max(30, Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
      for (const job of batch) for (const waiter of job.waiters) waiter.reject(error);
    } finally {
      for (const job of batch) this.active.delete(job.phone);
      this.running = false;
      if (this.jobs.size) this.schedule(0);
    }
  }

  cancelBackground() {
    for (const [phone, job] of this.jobs) {
      if (job.priority === 'interactive') continue;
      this.jobs.delete(phone);
      for (const waiter of job.waiters)
        waiter.reject(new Error('La consulta de contactos se pausó.'));
    }
    if (!this.jobs.size && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  cancelAll() {
    const error = new Error('La sesión cambió. Vuelve a consultar tus contactos.');
    for (const job of [...this.jobs.values(), ...this.active.values()]) {
      for (const waiter of job.waiters) waiter.reject(error);
      job.waiters = [];
    }
    this.jobs.clear();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
