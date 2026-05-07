import { resetIdentityFlowScrollPositionForHandoff } from '@/lib/identity-flow-scroll';
import { requestLaunchTargetRemeasure } from '@/lib/launch-target-remeasure';

export interface SetupEntryHandoffRequest {
  readonly id: number;
  readonly startedAt: number;
}

type SetupEntryHandoffListener = (request: SetupEntryHandoffRequest) => void;

let nextRequestId = 0;
const listeners = new Set<SetupEntryHandoffListener>();
const SETUP_ENTRY_TARGET_REMEASURE_FRAMES = 8;
let pendingSetupEntryHandoff: Promise<void> | null = null;

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function runSetupEntryHandoff() {
  await resetIdentityFlowScrollPositionForHandoff();

  requestLaunchTargetRemeasure();
  for (let frame = 0; frame < SETUP_ENTRY_TARGET_REMEASURE_FRAMES; frame += 1) {
    await waitForNextFrame();
  }

  const request = {
    id: ++nextRequestId,
    startedAt: Date.now(),
  };

  listeners.forEach((listener) => listener(request));
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
