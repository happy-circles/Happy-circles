import {
  detectBestAnchoredCycleSettlement,
  parseAmountMinor,
  type PairNetEdge,
} from '../_shared/cycle.ts';
import { createServiceRoleClient, handlePublicRpc, jsonResponse } from '../_shared/http.ts';

const graphCycleWorkerSecret = Deno.env.get('GRAPH_CYCLE_WORKER_SECRET') ?? '';

interface ClaimedJob {
  id: string;
  actorUserId: string;
  userLowId: string;
  userHighId: string;
  currencyCode: string;
}

function checkWorkerAccess(request: Request): Response | null {
  if (!graphCycleWorkerSecret) {
    return jsonResponse(503, {
      error: 'Worker no configurado.',
      code: 'worker_not_configured',
    });
  }

  if (request.headers.get('x-worker-secret') !== graphCycleWorkerSecret) {
    return jsonResponse(403, {
      error: 'Worker no autorizado.',
      code: 'forbidden',
    });
  }

  return null;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }

  return value.trim();
}

function parseClaimedJob(value: unknown): ClaimedJob | null {
  if (value === null) {
    return null;
  }

  const record = asRecord(value, 'claimed job');
  return {
    id: requireString(record.id, 'job.id'),
    actorUserId: requireString(record.actorUserId, 'job.actorUserId'),
    userLowId: requireString(record.userLowId, 'job.userLowId'),
    userHighId: requireString(record.userHighId, 'job.userHighId'),
    currencyCode: requireString(record.currencyCode, 'job.currencyCode'),
  };
}

function parseEdge(value: unknown, field: string): PairNetEdge {
  const record = asRecord(value, field);
  return {
    debtor_user_id: requireString(record.debtor_user_id, `${field}.debtor_user_id`),
    creditor_user_id: requireString(record.creditor_user_id, `${field}.creditor_user_id`),
    amount_minor: parseAmountMinor(record.amount_minor, `${field}.amount_minor`),
  };
}

Deno.serve((request) => {
  const accessResponse = checkWorkerAccess(request);
  if (accessResponse) {
    return accessResponse;
  }

  return handlePublicRpc(
    request,
    async (body) => {
      const client = createServiceRoleClient();
      const limit = Number(body.limit ?? 10);
      if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
        throw new Error('Invalid limit');
      }

      const workerId =
        typeof body.workerId === 'string' && body.workerId.trim().length > 0
          ? body.workerId.trim()
          : `edge-worker-${crypto.randomUUID()}`;
      const results: unknown[] = [];

      for (let index = 0; index < limit; index += 1) {
        const { data: claimedData, error: claimError } = await client.rpc('claim_graph_cycle_job', {
          p_worker_id: workerId,
        });

        if (claimError) {
          throw claimError;
        }

        const job = parseClaimedJob(claimedData);
        if (!job) {
          break;
        }

        try {
          const { data: contextData, error: contextError } = await client.rpc(
            'get_graph_cycle_job_context',
            { p_job_id: job.id },
          );

          if (contextError) {
            throw contextError;
          }

          const payload = asRecord(contextData, 'job context');
          const context = asRecord(payload.context, 'job context payload');
          const status = requireString(context.status, 'context.status');

          if (status !== 'ok') {
            const result = { status: 'no_cycles', reason: status };
            const { data: completed, error: completeError } = await client.rpc(
              'complete_graph_cycle_job',
              {
                p_job_id: job.id,
                p_worker_id: workerId,
                p_result_json: result,
              },
            );

            if (completeError) {
              throw completeError;
            }

            results.push(completed);
            continue;
          }

          const anchorEdge = parseEdge(context.anchorEdge, 'context.anchorEdge');
          if (!Array.isArray(context.graphSnapshot)) {
            throw new Error('Invalid context.graphSnapshot');
          }

          const graphSnapshot = context.graphSnapshot;
          const edges = graphSnapshot.map((edge, edgeIndex) =>
            parseEdge(edge, `context.graphSnapshot[${edgeIndex}]`),
          );
          const draft = detectBestAnchoredCycleSettlement(edges, anchorEdge);

          if (!draft) {
            const result = { status: 'no_cycles' };
            const { data: completed, error: completeError } = await client.rpc(
              'complete_graph_cycle_job',
              {
                p_job_id: job.id,
                p_worker_id: workerId,
                p_result_json: result,
              },
            );

            if (completeError) {
              throw completeError;
            }

            results.push(completed);
            continue;
          }

          const { data: proposal, error: proposalError } = await client.rpc(
            'propose_cycle_settlement',
            {
              p_actor_user_id: job.actorUserId,
              p_idempotency_key: `graph_cycle_job_${job.id}`,
              p_graph_snapshot_hash: requireString(
                context.graphSnapshotHash,
                'context.graphSnapshotHash',
              ),
              p_graph_snapshot: graphSnapshot,
              p_movements_json: draft.movements,
              p_participant_user_ids: draft.participantUserIds,
              p_anchor_user_low_id: job.userLowId,
              p_anchor_user_high_id: job.userHighId,
              p_currency_code: job.currencyCode,
              p_source_graph_cycle_job_id: job.id,
            },
          );

          if (proposalError) {
            throw proposalError;
          }

          const result = {
            status: 'proposal_created',
            proposal,
            amountMinor: draft.amountMinor,
            participantUserIds: draft.participantUserIds,
          };
          const { data: completed, error: completeError } = await client.rpc(
            'complete_graph_cycle_job',
            {
              p_job_id: job.id,
              p_worker_id: workerId,
              p_result_json: result,
            },
          );

          if (completeError) {
            throw completeError;
          }

          results.push(completed);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const { data: failed, error: failError } = await client.rpc('fail_graph_cycle_job', {
            p_job_id: job.id,
            p_worker_id: workerId,
            p_error: message,
          });

          if (failError) {
            throw failError;
          }

          results.push(failed);
        }
      }

      return {
        status: 'processed',
        processedCount: results.length,
        results,
      };
    },
    {
      maxBodyBytes: 16 * 1024,
      rateLimit: {
        actorRequired: false,
        limit: 30,
        scope: 'process-graph-cycle-jobs',
        windowSeconds: 60,
      },
    },
  );
});
