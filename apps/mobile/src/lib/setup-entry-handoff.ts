import { prepareIdentityFlowTargetForHandoff } from '@/lib/identity-flow-scroll';

export interface SetupEntryHandoffRequest {
  readonly id: number;
  readonly startedAt: number;
}

type SetupEntryHandoffListener = (request: SetupEntryHandoffRequest) => void;

let nextRequestId = 0;
const listeners = new Set<SetupEntryHandoffListener>();
let pendingSetupEntryHandoff: Promise<void> | null = null;
const SETUP_ENTRY_OVERLAY_SETTLE_FRAMES = 2;

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForFrames(frameCount: number) {
  for (let frame = 0; frame < frameCount; frame += 1) {
    await waitForNextFrame();
  }
}

async function runSetupEntryHandoff() {
  await prepareIdentityFlowTargetForHandoff({ animated: true });

  const request = {
    id: ++nextRequestId,
    startedAt: Date.now(),
  };

  listeners.forEach((listener) => listener(request));
  await waitForFrames(SETUP_ENTRY_OVERLAY_SETTLE_FRAMES);
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
