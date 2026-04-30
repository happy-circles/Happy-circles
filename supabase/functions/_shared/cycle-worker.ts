const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const graphCycleWorkerSecret = Deno.env.get('GRAPH_CYCLE_WORKER_SECRET') ?? '';

export function triggerGraphCycleWorker(limit = 1): void {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return;
  }

  const promise = fetch(`${supabaseUrl}/functions/v1/process-graph-cycle-jobs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      ...(graphCycleWorkerSecret ? { 'x-worker-secret': graphCycleWorkerSecret } : {}),
    },
    body: JSON.stringify({ limit }),
  }).catch((error) => {
    console.error('graph_cycle_worker_trigger_failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
  });

  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
  }
}
