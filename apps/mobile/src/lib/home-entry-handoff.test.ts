import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RafCallback = (timestamp: number) => void;

async function loadHomeEntryHandoff() {
  vi.resetModules();
  return import('@/lib/home-entry-handoff');
}

describe('home entry handoff coordinator', () => {
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

  it('dedupes concurrent handoff preparation requests', async () => {
    const handoff = await loadHomeEntryHandoff();
    const requestIds: number[] = [];
    const unsubscribe = handoff.subscribeHomeEntryHandoff((request) => {
      requestIds.push(request.id);
      request.completeSourceCentering();
    });

    const firstRequest = handoff.beginHomeEntryHandoffAfterScrollReset();
    const secondRequest = handoff.beginHomeEntryHandoffAfterScrollReset();

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([firstRequest, secondRequest]);

    expect(requestIds).toEqual([1]);
    unsubscribe();
  });

  it('keeps the request pending until source centering settles or the guard resolves', async () => {
    const handoff = await loadHomeEntryHandoff();
    let settled = false;

    const request = handoff.beginHomeEntryHandoff({ waitForSourceCentering: true });
    void request.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(419);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    await request;

    expect(settled).toBe(true);
  });

  it('publishes increasing home-ready versions', async () => {
    const handoff = await loadHomeEntryHandoff();
    const versions: number[] = [];
    const unsubscribe = handoff.subscribeHomeEntryReady((version) => {
      versions.push(version);
    });

    const initialVersion = handoff.getHomeEntryReadyVersion();
    handoff.markHomeEntryReady();
    handoff.markHomeEntryReady();

    expect(versions).toEqual([initialVersion + 1, initialVersion + 2]);
    expect(handoff.getHomeEntryReadyVersion()).toBe(initialVersion + 2);
    unsubscribe();
  });
});
