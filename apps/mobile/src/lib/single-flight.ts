export interface SingleFlightRef<T> {
  current: Promise<T> | null;
}

export function runSingleFlight<T>(
  ref: SingleFlightRef<T>,
  action: () => Promise<T>,
): Promise<T> {
  if (ref.current) {
    return ref.current;
  }

  let pending: Promise<T>;
  try {
    pending = Promise.resolve(action());
  } catch (error) {
    pending = Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  ref.current = pending;

  void pending.then(
    () => {
      if (ref.current === pending) {
        ref.current = null;
      }
    },
    () => {
      if (ref.current === pending) {
        ref.current = null;
      }
    },
  );

  return pending;
}
