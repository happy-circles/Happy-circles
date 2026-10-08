import {
  prepareIdentityFlowTargetForHandoff,
  resetIdentityFlowScrollPosition,
} from '@/lib/identity-flow-scroll';
import {
  createVisualTransition,
  IDENTITY_HANDOFF_PREPARATION_TIMEOUT_MS,
  type VisualTransition,
} from '@/lib/visual-transition';

export interface HomeEntryHandoffRequest {
  readonly completeSourceCentering: () => void;
  readonly id: number;
  readonly readyVersionAtStart: number;
  readonly startedAt: number;
  readonly waitForSourceCentering: boolean;
  readonly subscribePreparationFallback: VisualTransition['subscribeFallback'];
}

type HomeEntryHandoffListener = (request: HomeEntryHandoffRequest) => void;
type HomeEntryReadyListener = (version: number) => void;

let nextRequestId = 0;
let readyVersion = 0;
const listeners = new Set<HomeEntryHandoffListener>();
const readyListeners = new Set<HomeEntryReadyListener>();
const HOME_ENTRY_SOURCE_CENTER_FALLBACK_MS = 420;
const HOME_ENTRY_SOURCE_CENTER_SETTLE_FRAMES = 2;
let pendingHomeEntryHandoff: Promise<void> | null = null;

export async function beginHomeEntryHandoff(options?: {
  readonly skipScrollReset?: boolean;
  readonly waitForSourceCentering?: boolean;
  readonly transition?: VisualTransition;
}) {
  const transition =
    options?.transition ?? createVisualTransition(IDENTITY_HANDOFF_PREPARATION_TIMEOUT_MS);
  try {
    if (!transition.isActive()) return;
    if (!options?.skipScrollReset) resetIdentityFlowScrollPosition();
    let completeSourceCentering: () => void = () => undefined;
    const sourceCentering = options?.waitForSourceCentering
      ? transition.waitForSignal((complete) => {
          completeSourceCentering = complete;
          return () => undefined;
        }, HOME_ENTRY_SOURCE_CENTER_FALLBACK_MS)
      : Promise.resolve(true);
    const request: HomeEntryHandoffRequest = {
      completeSourceCentering,
      id: ++nextRequestId,
      readyVersionAtStart: readyVersion,
      startedAt: Date.now(),
      waitForSourceCentering: Boolean(options?.waitForSourceCentering),
      subscribePreparationFallback: transition.subscribeFallback,
    };
    for (const listener of listeners) {
      if (!transition.isActive()) return;
      listener(request);
    }
    if (!options?.waitForSourceCentering) return;
    await sourceCentering;
    for (let frame = 0; frame < HOME_ENTRY_SOURCE_CENTER_SETTLE_FRAMES; frame += 1) {
      if (!(await transition.waitForFrame())) return;
    }
  } catch {
    transition.fallback();
  } finally {
    if (!options?.transition) transition.cancel();
  }
}

async function runHomeEntryHandoffAfterScrollReset() {
  const transition = createVisualTransition(IDENTITY_HANDOFF_PREPARATION_TIMEOUT_MS);
  try {
    await beginHomeEntryHandoff({
      skipScrollReset: true,
      waitForSourceCentering: true,
      transition,
    });
    if (transition.isActive()) {
      await prepareIdentityFlowTargetForHandoff({ animated: true, transition });
    }
  } finally {
    transition.cancel();
  }
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
  readyListeners.forEach((listener) => {
    try {
      listener(readyVersion);
    } catch {
      // A broken visual subscriber must not prevent the other layers from finishing.
    }
  });
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
