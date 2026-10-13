import { handleRpc } from '../_shared/http.ts';

Deno.serve((request) =>
  handleRpc(
    request,
    async () => {
      throw new Error('transaction_reversal_disabled');
    },
    // Retired commands authenticate callers but never access the database.
    { rateLimit: false },
  ),
);
