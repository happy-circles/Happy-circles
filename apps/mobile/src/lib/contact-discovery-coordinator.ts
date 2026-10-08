import type { ContactResolutionPriority } from './contact-resolution-scheduler';

const priorityRank = { interactive: 0, event: 1, visible: 2, background: 3 };
const RENEW_INTERVAL_MS = 5 * 60_000;
const LEASE_TTL_MS = 15 * 60_000;
type Dependencies = {
  readonly createSessionId: () => string;
  readonly isConnected: () => boolean;
  readonly setSession: (sessionId: string | null) => void;
  readonly beginRecovery: () => void;
  readonly register: (
    phones: readonly string[],
    priority: ContactResolutionPriority,
  ) => Promise<unknown>;
  readonly resolve: (
    phones: readonly string[],
    priority: ContactResolutionPriority,
  ) => Promise<unknown>;
  readonly synchronize?: (
    phones: readonly string[],
    priority: ContactResolutionPriority,
  ) => Promise<{
    readonly recheck?: readonly { readonly phoneE164: string; readonly at: number }[];
  }>;
  readonly renew: (sessionId: string) => Promise<{ readonly status: string }>;
  readonly stop: (sessionId: string) => Promise<unknown>;
  readonly remove?: (phones: readonly string[]) => Promise<unknown>;
};

/** A foreground lease belongs to the signed-in app, never to a contacts modal. */
export class ContactDiscoveryCoordinator {
  private active = false;
  private sessionId: string | null = null;
  private known = new Set<string>();
  private visible = new Set<string>();
  private pending = new Map<string, ContactResolutionPriority>();
  private deferred = new Map<string, number>();
  private retiring = new Set<string>();
  private removing = false;
  private removalRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private generation = 0;
  private connected = false;
  private hasConnected = false;
  private nextRenewAt = 0;
  private leaseExpiresAt = 0;
  private renewing = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly dependencies: Dependencies) {}

  activate() {
    if (this.active) return;
    this.active = true;
    this.connected = this.dependencies.isConnected();
    this.hasConnected = this.connected;
    this.startSession();
    this.interval = setInterval(() => this.tick(), 15_000);
  }

  private startSession() {
    this.generation += 1;
    this.sessionId = this.dependencies.createSessionId();
    this.dependencies.setSession(this.sessionId);
    if (this.known.size) this.dependencies.beginRecovery();
    this.nextRenewAt = Date.now() + RENEW_INTERVAL_MS;
    this.leaseExpiresAt = Date.now() + LEASE_TTL_MS;
    this.recover();
  }

  addPhones(phones: readonly string[], priority: ContactResolutionPriority = 'background') {
    const added = phones.filter((phone) => !this.known.has(phone));
    for (const phone of added) this.known.add(phone);
    for (const phone of phones) this.retiring.delete(phone);
    this.enqueue(added, priority);
    if (priority === 'visible') {
      for (const phone of phones) {
        if (this.pending.has(phone)) this.pending.set(phone, 'visible');
      }
      const readyPhones = phones.filter(
        (phone) => !added.includes(phone) && !this.pending.has(phone),
      );
      if (this.active && this.connected && readyPhones.length)
        void this.dependencies.resolve(readyPhones, 'visible').catch(() => undefined);
    }
  }

  setVisiblePhones(phones: readonly string[]) {
    this.visible = new Set(phones);
    for (const phone of phones) {
      const priority = this.pending.get(phone);
      if (priority && priorityRank.visible < priorityRank[priority])
        this.pending.set(phone, 'visible');
    }
  }

  replaceKnownPhones(phones: readonly string[]) {
    const next = new Set(phones);
    const added = [...next].filter((phone) => !this.known.has(phone));
    const removed = [...this.known].filter((phone) => !next.has(phone));
    this.known = next;
    for (const phone of removed) {
      this.pending.delete(phone);
      this.deferred.delete(phone);
      this.visible.delete(phone);
      this.retiring.add(phone);
    }
    for (const phone of added) this.retiring.delete(phone);
    void this.removeRetired();
    this.enqueue(added, 'background');
    return removed;
  }

  private async removeRetired() {
    if (
      !this.active ||
      !this.connected ||
      this.removing ||
      this.removalRetryTimer ||
      !this.dependencies.remove
    )
      return;
    const phones = [...this.retiring].filter((phone) => !this.known.has(phone));
    if (!phones.length) return;
    this.removing = true;
    const generation = this.generation;
    try {
      await this.dependencies.remove(phones);
      if (generation === this.generation) for (const phone of phones) this.retiring.delete(phone);
    } catch {
      if (this.active && generation === this.generation)
        this.removalRetryTimer = setTimeout(() => {
          this.removalRetryTimer = null;
          void this.removeRetired();
        }, 30_000);
    } finally {
      this.removing = false;
      if (this.active && !this.removalRetryTimer && this.retiring.size) void this.removeRetired();
    }
  }

  handleInvalidation(phones: readonly string[], priority: 'event' | 'background' = 'event') {
    this.enqueue(
      phones.filter((phone) => this.known.has(phone)),
      priority,
    );
  }

  connectionChanged() {
    const connected = this.dependencies.isConnected();
    if (connected === this.connected) return;
    const wasConnected = this.connected;
    const hadConnected = this.hasConnected;
    this.connected = connected;
    if (connected) this.hasConnected = true;
    if (!this.active || !connected) return;
    if (!wasConnected) {
      // Broadcast has no durable replay. One bounded recovery reconciles the
      // gap while keeping the last rows visible, with visible phones first.
      if (hadConnected) this.dependencies.beginRecovery();
      this.recover();
    }
  }

  private recover() {
    this.deferred.clear();
    void this.removeRetired();
    for (const phone of this.known) this.pending.set(phone, 'background');
    for (const phone of this.visible) this.pending.set(phone, 'visible');
    void this.pump();
  }

  private enqueue(phones: readonly string[], priority: ContactResolutionPriority) {
    if (!this.active) return;
    for (const phone of phones) {
      const current = this.pending.get(phone);
      if (!current || priorityRank[priority] < priorityRank[current])
        this.pending.set(phone, priority);
    }
    void this.pump();
  }

  private async pump() {
    if (this.running || !this.active || !this.connected || !this.pending.size || this.retryTimer)
      return;
    this.running = true;
    const generation = this.generation;
    try {
      while (this.active && this.connected && generation === this.generation && this.pending.size) {
        const batch = [...this.pending.entries()]
          .sort((a, b) => priorityRank[a[1]] - priorityRank[b[1]])
          .slice(0, 60);
        const priority = batch[0][1];
        const phones = batch.map(([phone]) => phone);
        for (const phone of phones) this.pending.delete(phone);
        try {
          if (this.dependencies.synchronize) {
            const result = await this.dependencies.synchronize(phones, priority);
            if (!this.active || generation !== this.generation) break;
            for (const phone of phones) this.deferred.delete(phone);
            for (const recheck of result.recheck ?? []) {
              if (this.known.has(recheck.phoneE164))
                this.deferred.set(recheck.phoneE164, recheck.at);
            }
          } else {
            await this.dependencies.register(phones, priority);
            if (!this.active || !this.connected || generation !== this.generation) break;
            await this.dependencies.resolve(phones, priority);
          }
        } catch {
          if (this.active && generation === this.generation) {
            for (const [phone, priority] of batch) {
              if (!this.known.has(phone)) continue;
              const queuedPriority = this.pending.get(phone);
              if (!queuedPriority || priorityRank[priority] < priorityRank[queuedPriority])
                this.pending.set(phone, priority);
            }
            this.retryTimer = setTimeout(() => {
              this.retryTimer = null;
              void this.pump();
            }, 30_000);
          }
          break;
        }
      }
    } finally {
      this.running = false;
      if (this.active && this.connected && this.pending.size && !this.retryTimer) void this.pump();
    }
  }

  private tick() {
    if (!this.active || !this.connected) return;
    if (Date.now() >= this.leaseExpiresAt) {
      this.startSession();
      return;
    }
    for (const [phone, at] of this.deferred) {
      if (Date.now() < at) continue;
      this.deferred.delete(phone);
      this.pending.set(phone, this.visible.has(phone) ? 'visible' : 'background');
    }
    void this.pump();
    if (this.visible.size)
      void this.dependencies.resolve([...this.visible], 'visible').catch(() => undefined);
    if (!this.sessionId || this.renewing || Date.now() < this.nextRenewAt) return;
    const sessionId = this.sessionId;
    this.renewing = true;
    void this.dependencies
      .renew(sessionId)
      .then((result) => {
        if (!this.active || this.sessionId !== sessionId) return;
        if (result.status === 'expired') {
          this.pending.clear();
          this.startSession();
        } else {
          this.nextRenewAt = Date.now() + RENEW_INTERVAL_MS;
          this.leaseExpiresAt = Date.now() + LEASE_TTL_MS;
        }
      })
      .catch(() => {
        if (this.sessionId === sessionId) this.nextRenewAt = Date.now() + 30_000;
      })
      .finally(() => {
        this.renewing = false;
      });
  }

  suspend() {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    const sessionId = this.sessionId;
    this.sessionId = null;
    this.dependencies.setSession(null);
    this.pending.clear();
    this.deferred.clear();
    this.retiring.clear();
    if (this.interval) clearInterval(this.interval);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.removalRetryTimer) clearTimeout(this.removalRetryTimer);
    this.interval = null;
    this.retryTimer = null;
    this.removalRetryTimer = null;
    if (sessionId) void this.dependencies.stop(sessionId).catch(() => undefined);
  }

  dispose() {
    this.suspend();
    this.known.clear();
    this.visible.clear();
  }
}
