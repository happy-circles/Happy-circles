import {
  resetIdentityFlowScrollPosition,
  resetIdentityFlowScrollPositionForHandoff,
} from '@/lib/identity-flow-scroll';
import { requestLaunchTargetRemeasure } from '@/lib/launch-target-remeasure';

export interface HomeEntryHandoffRequest {
  readonly completeSourceCentering: () => void;
  readonly id: number;
  readonly readyVersionAtStart: number;
  readonly startedAt: number;
  readonly waitForSourceCentering: boolean;
}

type HomeEntryHandoffListener = (request: HomeEntryHandoffRequest) => void;
type HomeEntryReadyListener = (version: number) => void;

let nextRequestId = 0;
let readyVersion = 0;
const listeners = new Set<HomeEntryHandoffListener>();
const readyListeners = new Set<HomeEntryReadyListener>();
const HOME_ENTRY_SOURCE_CENTER_FALLBACK_MS = 420;
const HOME_ENTRY_SOURCE_CENTER_SETTLE_FRAMES = 2;
const HOME_ENTRY_TARGET_REMEASURE_FRAMES = 8;
let pendingHomeEntryHandoff: Promise<void> | null = null;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function beginHomeEntryHandoff(options?: {
  readonly skipScrollReset?: boolean;
  readonly waitForSourceCentering?: boolean;
}) {
  if (!options?.skipScrollReset) {
    resetIdentityFlowScrollPosition();
  }

  let sourceCenteringSettled = false;
  let completeSourceCentering = () => {
    sourceCenteringSettled = true;
  };
  const sourceCenteringPromise = options?.waitForSourceCentering
    ? new Promise<void>((resolve) => {
        completeSourceCentering = () => {
          if (sourceCenteringSettled) {
            return;
          }

          sourceCenteringSettled = true;
          resolve();
        };
      })
    : Promise.resolve();
  const request = {
    completeSourceCentering,
    id: ++nextRequestId,
    readyVersionAtStart: readyVersion,
    startedAt: Date.now(),
    waitForSourceCentering: Boolean(options?.waitForSourceCentering),
  };

  listeners.forEach((listener) => listener(request));

  if (!options?.waitForSourceCentering) {
    return;
  }

  await Promise.race([sourceCenteringPromise, wait(HOME_ENTRY_SOURCE_CENTER_FALLBACK_MS)]);

  for (let frame = 0; frame < HOME_ENTRY_SOURCE_CENTER_SETTLE_FRAMES; frame += 1) {
    await waitForNextFrame();
  }
}

async function runHomeEntryHandoffAfterScrollReset() {
  await resetIdentityFlowScrollPositionForHandoff();

  requestLaunchTargetRemeasure();
  for (let frame = 0; frame < HOME_ENTRY_TARGET_REMEASURE_FRAMES; frame += 1) {
    await waitForNextFrame();
  }

  await beginHomeEntryHandoff({ skipScrollReset: true, waitForSourceCentering: true });
}

export async function beginHomeEntryHandoffAfterScrollReset() {
  if (pendingHomeEntryHandoff) {
    return pendingHomeEntryHandoff;
  }

  pendingHomeEntryHandoff = runHomeEntryHandoffAfterScrollReset();

  try {
    await pendingHomeEntryHandoff;
  } finally {
    pendingHomeEntryHandoff = null;
  }
}

export function subscribeHomeEntryHandoff(listener: HomeEntryHandoffListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function markHomeEntryReady() {
  readyVersion += 1;
  readyListeners.forEach((listener) => listener(readyVersion));
}

export function subscribeHomeEntryReady(listener: HomeEntryReadyListener) {
  readyListeners.add(listener);

  return () => {
    readyListeners.delete(listener);
  };
}

export function getHomeEntryReadyVersion() {
  return readyVersion;
}
