import { describe, expect, it, vi } from 'vitest';

import {
  captureSessionDataGeneration,
  invalidateSessionData,
  isSessionDataGenerationCurrent,
} from '../session-data-boundary';
import { restorePeopleOverviewForSession } from './people-overview-hydration';
import type { CachedPeopleOverview } from './people-overview-cache';

const cached: CachedPeopleOverview = {
  avatarSignedUrlsByPath: {},
  overview: { fetchedAt: '2026-10-13T12:00:00Z', people: [] },
  updatedAt: '2026-10-13T12:00:00Z',
};

describe('people overview cache hydration', () => {
  it('does not publish a delayed restore after the session is invalidated', async () => {
    const generation = captureSessionDataGeneration();
    let resolve!: (value: CachedPeopleOverview) => void;
    const publish = vi.fn();
    const restored = restorePeopleOverviewForSession({
      read: () =>
        new Promise((done) => {
          resolve = done;
        }),
      canRestore: () => isSessionDataGenerationCurrent(generation),
      publish,
    });
    invalidateSessionData();
    resolve(cached);
    expect(await restored).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not overwrite live data that arrived while reading the cache', async () => {
    let liveData = false;
    const publish = vi.fn();
    const restored = restorePeopleOverviewForSession({
      read: async () => {
        liveData = true;
        return cached;
      },
      canRestore: () => !liveData,
      publish,
    });
    expect(await restored).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes a current restore once', async () => {
    const publish = vi.fn();
    expect(
      await restorePeopleOverviewForSession({
        read: async () => cached,
        canRestore: () => true,
        publish,
      }),
    ).toBe(true);
    expect(publish).toHaveBeenCalledExactlyOnceWith(cached);
  });
});
