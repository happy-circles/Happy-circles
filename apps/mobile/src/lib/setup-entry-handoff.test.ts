import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RafCallback = (timestamp: number) => void;

async function loadSetupEntryHandoff() {
  vi.resetModules();
  const [handoff, remeasure] = await Promise.all([
    import('@/lib/setup-entry-handoff'),
    import('@/lib/launch-target-remeasure'),
  ]);

  return { handoff, remeasure };
}

async function advanceAnimationFrames(count: number) {
  for (let frame = 0; frame < count; frame += 1) {
    await vi.advanceTimersByTimeAsync(16);
  }
}

describe('setup entry handoff coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: RafCallback) =>
      setTimeout(() => callback(Date.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: ReturnType<typeof setTimeout>) => {
      clearTimeout(handle);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('dedupes concurrent setup handoff requests while target measurement settles', async () => {
    const { handoff, remeasure } = await loadSetupEntryHandoff();
    const requestIds: number[] = [];
    let remeasureCount = 0;
    const unsubscribeHandoff = handoff.subscribeSetupEntryHandoff((request) => {
      requestIds.push(request.id);
    });
    const unsubscribeRemeasure = remeasure.subscribeLaunchTargetRemeasure(() => {
      remeasureCount += 1;
    });

    const firstRequest = handoff.beginSetupEntryHandoff();
    const secondRequest = handoff.beginSetupEntryHandoff();

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([firstRequest, secondRequest]);

    expect(requestIds).toEqual([1]);
    expect(remeasureCount).toBe(1);
    unsubscribeHandoff();
    unsubscribeRemeasure();
  });

  it('keeps navigation pending briefly after publishing the setup overlay request', async () => {
    const { handoff } = await loadSetupEntryHandoff();
    let requestPublished = false;
    let settled = false;
    const unsubscribeHandoff = handoff.subscribeSetupEntryHandoff(() => {
      requestPublished = true;
    });

    const request = handoff.beginSetupEntryHandoff();
    void request.then(() => {
      settled = true;
    });

    for (let attempts = 0; attempts < 30 && !requestPublished; attempts += 1) {
      await advanceAnimationFrames(1);
    }

    expect(requestPublished).toBe(true);
    expect(settled).toBe(false);

    await advanceAnimationFrames(1);
    expect(settled).toBe(false);

    await advanceAnimationFrames(1);
    await request;

    expect(settled).toBe(true);
    unsubscribeHandoff();
  });
});
