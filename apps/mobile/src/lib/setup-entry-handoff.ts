export interface SetupEntryHandoffRequest {
  readonly id: number;
  readonly startedAt: number;
}

type SetupEntryHandoffListener = (request: SetupEntryHandoffRequest) => void;

let nextRequestId = 0;
const listeners = new Set<SetupEntryHandoffListener>();

export function beginSetupEntryHandoff() {
  const request = {
    id: ++nextRequestId,
    startedAt: Date.now(),
  };

  listeners.forEach((listener) => listener(request));
}

export function subscribeSetupEntryHandoff(listener: SetupEntryHandoffListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
