export interface HomeEntryHandoffRequest {
  readonly id: number;
  readonly readyVersionAtStart: number;
  readonly startedAt: number;
}

type HomeEntryHandoffListener = (request: HomeEntryHandoffRequest) => void;
type HomeEntryReadyListener = (version: number) => void;

let nextRequestId = 0;
let readyVersion = 0;
const listeners = new Set<HomeEntryHandoffListener>();
const readyListeners = new Set<HomeEntryReadyListener>();

export function beginHomeEntryHandoff() {
  const request = {
    id: ++nextRequestId,
    readyVersionAtStart: readyVersion,
    startedAt: Date.now(),
  };

  listeners.forEach((listener) => listener(request));
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
