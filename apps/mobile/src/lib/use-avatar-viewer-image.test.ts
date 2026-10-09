import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageRef } from 'expo-image';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
  stateWrites: 0,
}));

const mocks = vi.hoisted(() => ({
  cachedImages: new Map<string, ImageRef>(),
  ensureAvatarImageRef: vi.fn(),
}));

function sameDependencies(previous: readonly unknown[] | undefined, next: readonly unknown[]) {
  return Boolean(
    previous &&
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index])),
  );
}

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) {
      const state = {
        value: typeof initial === 'function' ? (initial as () => unknown)() : initial,
        set: (value: unknown) => {
          harness.stateWrites += 1;
          state.value =
            typeof value === 'function'
              ? (value as (previous: unknown) => unknown)(state.value)
              : value;
        },
      };
      harness.slots[index] = state;
    }
    const state = harness.slots[index] as { value: unknown; set: (value: unknown) => void };
    return [state.value, state.set];
  },
  useEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      harness.pendingEffects.push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: callback() });
      });
    }
  },
}));

vi.mock('./avatar', () => ({
  avatarImageCacheKey: (path: string | null | undefined) =>
    path?.trim().replace(/^\/+/, '') || undefined,
}));

vi.mock('./avatar-prefetch', () => ({
  getPrefetchedAvatarImageRef: (path: string | null | undefined) => {
    const cacheKey = path?.trim().replace(/^\/+/, '');
    return cacheKey ? mocks.cachedImages.get(cacheKey) : undefined;
  },
  ensureAvatarImageRef: mocks.ensureAvatarImageRef,
}));

import { useAvatarViewerImage } from './use-avatar-viewer-image';

function renderHook(path: string | null | undefined, visible = false): ImageRef | undefined {
  harness.cursor = 0;
  const image = useAvatarViewerImage(path, visible);
  const effects = harness.pendingEffects.splice(0);
  for (const effect of effects) effect();
  return image;
}

function unmountHook(): void {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  harness.effects.clear();
  harness.pendingEffects.length = 0;
}

function deferredImage() {
  let resolve!: (image: ImageRef | undefined) => void;
  const promise = new Promise<ImageRef | undefined>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const imageA = { width: 1024, height: 1024 } as ImageRef;
const imageB = { width: 800, height: 800 } as ImageRef;

beforeEach(() => {
  vi.resetAllMocks();
  harness.cursor = 0;
  harness.slots.length = 0;
  harness.effects.clear();
  harness.pendingEffects.length = 0;
  harness.stateWrites = 0;
  mocks.cachedImages.clear();
  mocks.ensureAvatarImageRef.mockResolvedValue(undefined);
});

afterEach(() => {
  unmountHook();
});

describe('useAvatarViewerImage', () => {
  it.each([null, undefined, '', '   '])('safely skips an absent avatar path (%s)', (path) => {
    expect(renderHook(path, false)).toBeUndefined();
    expect(renderHook(path, true)).toBeUndefined();
    expect(mocks.ensureAvatarImageRef).not.toHaveBeenCalled();
  });

  it('starts loading when the profile mounts while its viewer is still hidden', () => {
    expect(renderHook('a.jpg', false)).toBeUndefined();
    expect(mocks.ensureAvatarImageRef).toHaveBeenCalledTimes(1);
    expect(mocks.ensureAvatarImageRef.mock.calls[0]?.[0]).toBe('a.jpg');

    renderHook('a.jpg', false);
    expect(mocks.ensureAvatarImageRef).toHaveBeenCalledTimes(1);
  });

  it('adopts a load that finishes after the viewer opens without needing a path change', async () => {
    const load = deferredImage();
    mocks.ensureAvatarImageRef.mockReturnValue(load.promise);

    expect(renderHook('a.jpg', false)).toBeUndefined();
    expect(renderHook('a.jpg', true)).toBeUndefined();
    load.resolve(imageA);

    await vi.waitFor(() => expect(renderHook('a.jpg', true)).toBe(imageA));
  });

  it('returns a cached image immediately and refreshes recency when opened', async () => {
    mocks.cachedImages.set('a.jpg', imageA);
    mocks.ensureAvatarImageRef.mockResolvedValue(imageA);

    expect(renderHook('a.jpg', false)).toBe(imageA);
    await Promise.resolve();
    expect(renderHook('a.jpg', true)).toBe(imageA);
    expect(mocks.ensureAvatarImageRef).toHaveBeenCalledTimes(2);
    expect(mocks.ensureAvatarImageRef.mock.calls[1]?.[0]).toBe('a.jpg');
  });

  it('keeps its retained image through reopening after the shared cache evicts it', async () => {
    const initialLoad = deferredImage();
    const reload = deferredImage();
    mocks.ensureAvatarImageRef.mockReturnValueOnce(initialLoad.promise);

    renderHook('a.jpg', false);
    initialLoad.resolve(imageA);
    await vi.waitFor(() => expect(renderHook('a.jpg', false)).toBe(imageA));

    mocks.ensureAvatarImageRef.mockReturnValue(reload.promise);
    expect(mocks.cachedImages.has('a.jpg')).toBe(false);
    expect(renderHook('a.jpg', true)).toBe(imageA);
    expect(renderHook('a.jpg', true)).toBe(imageA);
    expect(renderHook('a.jpg', false)).toBe(imageA);
    expect(renderHook('a.jpg', false)).toBe(imageA);
    reload.resolve(imageA);
  });

  it('never exposes the previous profile image while a new path is loading', async () => {
    const firstLoad = deferredImage();
    const secondLoad = deferredImage();
    mocks.ensureAvatarImageRef.mockReturnValueOnce(firstLoad.promise);
    mocks.ensureAvatarImageRef.mockReturnValueOnce(secondLoad.promise);

    renderHook('a.jpg');
    firstLoad.resolve(imageA);
    await vi.waitFor(() => expect(renderHook('a.jpg')).toBe(imageA));

    expect(renderHook('b.jpg')).toBeUndefined();
    expect(renderHook('b.jpg')).toBeUndefined();
    secondLoad.resolve(imageB);
    await vi.waitFor(() => expect(renderHook('b.jpg')).toBe(imageB));
  });

  it('ignores an older load that resolves after switching to another profile', async () => {
    const firstLoad = deferredImage();
    const secondLoad = deferredImage();
    mocks.ensureAvatarImageRef.mockReturnValueOnce(firstLoad.promise);
    mocks.ensureAvatarImageRef.mockReturnValueOnce(secondLoad.promise);

    renderHook('a.jpg');
    renderHook('b.jpg');
    secondLoad.resolve(imageB);
    await vi.waitFor(() => expect(renderHook('b.jpg')).toBe(imageB));
    const writesBeforeOldLoad = harness.stateWrites;

    firstLoad.resolve(imageA);
    await Promise.resolve();
    expect(harness.stateWrites).toBe(writesBeforeOldLoad);
    expect(renderHook('b.jpg')).toBe(imageB);
  });

  it('ignores completion after the profile unmounts', async () => {
    const load = deferredImage();
    mocks.ensureAvatarImageRef.mockReturnValue(load.promise);
    renderHook('a.jpg');
    unmountHook();
    const writesBeforeCompletion = harness.stateWrites;

    load.resolve(imageA);
    await Promise.resolve();
    expect(harness.stateWrites).toBe(writesBeforeCompletion);
  });

  it('does not load an empty path or retain the prior image when the photo is removed', async () => {
    mocks.ensureAvatarImageRef.mockResolvedValue(imageA);
    renderHook('a.jpg');
    await vi.waitFor(() => expect(renderHook('a.jpg')).toBe(imageA));
    const previousLoads = mocks.ensureAvatarImageRef.mock.calls.length;

    expect(renderHook(null)).toBeUndefined();
    expect(renderHook(null)).toBeUndefined();
    expect(mocks.ensureAvatarImageRef).toHaveBeenCalledTimes(previousLoads);
  });
});
