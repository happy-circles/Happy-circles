import { prepareIdentityFlowTargetForHandoff } from '@/lib/identity-flow-scroll';
import {
  createVisualTransition,
  IDENTITY_HANDOFF_PREPARATION_TIMEOUT_MS,
  type VisualTransition,
} from '@/lib/visual-transition';

export interface SetupEntryHandoffRequest {
  readonly id: number;
  readonly startedAt: number;
  readonly subscribePreparationFallback: VisualTransition['subscribeFallback'];
}

type SetupEntryHandoffListener = (request: SetupEntryHandoffRequest) => void;

let nextRequestId = 0;
const listeners = new Set<SetupEntryHandoffListener>();
let pendingSetupEntryHandoff: Promise<void> | null = null;
const SETUP_ENTRY_OVERLAY_SETTLE_FRAMES = 2;

async function runSetupEntryHandoff() {
  const transition = createVisualTransition(IDENTITY_HANDOFF_PREPARATION_TIMEOUT_MS);
  try {
    await prepareIdentityFlowTargetForHandoff({ animated: true, transition });
    if (!transition.isActive()) return;
    const request: SetupEntryHandoffRequest = {
      id: ++nextRequestId,
      startedAt: Date.now(),
      subscribePreparationFallback: transition.subscribeFallback,
    };
    for (const listener of listeners) {
      if (!transition.isActive()) return;
      listener(request);
    }
    for (let frame = 0; frame < SETUP_ENTRY_OVERLAY_SETTLE_FRAMES; frame += 1) {
      if (!(await transition.waitForFrame())) return;
    }
  } catch {
    transition.fallback();
  } finally {
    transition.cancel();
  }
}

export async function beginSetupEntryHandoff() {
  if (pendingSetupEntryHandoff) {
    return pendingSetupEntryHandoff;
  }

  pendingSetupEntryHandoff = runSetupEntryHandoff();

  try {
    await pendingSetupEntryHandoff;
  } finally {
    pendingSetupEntryHandoff = null;
  }
}

export function subscribeSetupEntryHandoff(listener: SetupEntryHandoffListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
