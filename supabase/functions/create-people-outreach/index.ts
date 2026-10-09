import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';
import { triggerPushNotificationWorker } from '../_shared/push-notifications.ts';
import { createPeopleOutreachEndpoint } from './handler.ts';

Deno.serve(
  createPeopleOutreachEndpoint(handleRpc, {
    createClient: createServiceRoleClient,
    requireString,
    triggerPushWorker: triggerPushNotificationWorker,
    onTiming: (timing) => console.log('outreach_timing', timing),
  }),
);
