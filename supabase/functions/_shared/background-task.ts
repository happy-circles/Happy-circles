/** Keep optional follow-up work alive after responding, or finish it before returning locally. */
export async function runBackgroundTask(
  task: () => Promise<unknown>,
  failureLabel: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const promise = Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(failureLabel, {
        ...metadata,
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    try {
      edgeRuntime.waitUntil(promise);
      return;
    } catch (error) {
      console.error('background_task_registration_failed', {
        ...metadata,
        task: failureLabel,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await promise;
}
