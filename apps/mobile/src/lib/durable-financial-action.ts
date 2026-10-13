import { appConfig } from './config';
import { DurableActionRegistry, durableActionSignature } from './durable-action';
import { durableActionStore } from './durable-action-store';
import { assertSessionDataGeneration, captureSessionDataGeneration } from './session-data-boundary';

const financialIntentions = new DurableActionRegistry(durableActionStore);

export function runDurableFinancialAction<T>(
  actorUserId: string,
  operation: string,
  payload: Readonly<Record<string, unknown>>,
  prefix: string,
  execute: (key: string) => Promise<T>,
  generation = captureSessionDataGeneration(),
): Promise<T> {
  assertSessionDataGeneration(generation);
  const signature = durableActionSignature({
    backendScope: appConfig.supabaseUrl,
    actorUserId,
    operation,
    payload,
  });
  return financialIntentions.run(signature, prefix, (key) => {
    // Acquiring the durable key can outlive a logout and even A -> B -> A.
    assertSessionDataGeneration(generation);
    return execute(key);
  });
}
