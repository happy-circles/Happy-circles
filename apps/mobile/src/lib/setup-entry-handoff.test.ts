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

describe('setup entry handoff coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: RafCallback) =>
      setTimeout(() => callback(Date.now()), 0),
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
});
