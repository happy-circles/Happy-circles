export interface PairNetEdge {
  debtor_user_id: string;
  creditor_user_id: string;
  amount_minor: number;
}

export interface CycleSettlementDraft {
  cycleNodes: string[];
  participantUserIds: string[];
  movements: Array<{
    debtor_user_id: string;
    creditor_user_id: string;
    amount_minor: number;
  }>;
}

function parseAmountMinor(value: unknown, field: string): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid ${field}`);
    }

    return value;
  }

  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Invalid ${field}`);
    }

    return parsed;
  }

  throw new Error(`Invalid ${field}`);
}

export function detectFirstCycleSettlement(edges: PairNetEdge[]): CycleSettlementDraft | null {
  return detectFirstCycleSettlementForUser(edges);
}

export function detectFirstCycleSettlementForUser(
  edges: PairNetEdge[],
  requiredUserId?: string,
): CycleSettlementDraft | null {
  const workingEdges = edges
    .filter((edge) => edge.amount_minor > 0)
    .map((edge) => ({ ...edge }));

  const cycle = findCycle(workingEdges, requiredUserId);
  if (!cycle) {
    return null;
  }

  const amountMinor = Math.min(...cycle.map((edge) => edge.amount_minor));
  const cycleNodes = cycle.map((edge) => edge.debtor_user_id);
  const participantUserIds = [...new Set([...cycleNodes, cycle[cycle.length - 1]!.creditor_user_id])].sort();

  return {
    cycleNodes,
    participantUserIds,
    movements: cycle.map((edge) => ({
      debtor_user_id: edge.creditor_user_id,
      creditor_user_id: edge.debtor_user_id,
      amount_minor: amountMinor,
    })),
  };
}

function findCycle(edges: PairNetEdge[], requiredUserId?: string): PairNetEdge[] | null {
  const nodes = [...new Set(edges.flatMap((edge) => [edge.debtor_user_id, edge.creditor_user_id]))].sort();
  const edgeIndex = new Map(edges.map((edge) => [`${edge.debtor_user_id}->${edge.creditor_user_id}`, edge]));
  const cycles: PairNetEdge[][] = [];

  for (const start of nodes) {
    const path = [start];
    const visited = new Set([start]);

    const visit = (current: string): void => {
      const outgoing = edges
        .filter((edge) => edge.debtor_user_id === current)
        .sort((left, right) => left.creditor_user_id.localeCompare(right.creditor_user_id));

      for (const edge of outgoing) {
        const next = edge.creditor_user_id;
        if (next === start && path.length >= 3) {
          cycles.push(toEdges(path, edgeIndex));
          continue;
        }

        if (visited.has(next)) {
          continue;
        }

        visited.add(next);
        path.push(next);
        visit(next);
        path.pop();
        visited.delete(next);
      }
    };

    visit(start);
  }

  if (cycles.length === 0) {
    return null;
  }

  return cycles
    .filter((cycle) => (requiredUserId ? cycleIncludesUser(cycle, requiredUserId) : true))
    .map((cycle) => ({ cycle, key: canonicalCycleKey(cycle) }))
    .sort((left, right) => left.key.localeCompare(right.key))[0]?.cycle ?? null;
}

function toEdges(cycleNodes: string[], edgeIndex: Map<string, PairNetEdge>): PairNetEdge[] {
  const edges: PairNetEdge[] = [];

  for (let index = 0; index < cycleNodes.length; index += 1) {
    const from = cycleNodes[index]!;
    const to = cycleNodes[(index + 1) % cycleNodes.length]!;
    const edge = edgeIndex.get(`${from}->${to}`);
    if (!edge) {
      throw new Error(`Missing edge ${from}->${to}`);
    }
    edges.push(edge);
  }

  return edges;
}

function canonicalCycleKey(cycle: PairNetEdge[]): string {
  const nodes = cycle.map((edge) => edge.debtor_user_id);
  let smallestIndex = 0;

  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index]!.localeCompare(nodes[smallestIndex]!) < 0) {
      smallestIndex = index;
    }
  }

  return nodes.slice(smallestIndex).concat(nodes.slice(0, smallestIndex)).join('>');
}

function cycleIncludesUser(cycle: PairNetEdge[], userId: string): boolean {
  const participantUserIds = new Set(cycle.map((edge) => edge.debtor_user_id));
  participantUserIds.add(cycle[cycle.length - 1]!.creditor_user_id);
  return participantUserIds.has(userId);
}

export async function proposeAutomaticCycleSettlement(
  client: any,
  actorUserId: string,
  idempotencyKey: string,
): Promise<{ status: string; proposalId?: string } | null> {
  const [{ data: edges, error: edgesError }, { data: hashData, error: hashError }] = await Promise.all([
    client.from('v_pair_net_edges_authoritative').select('debtor_user_id, creditor_user_id, amount_minor'),
    client.rpc('compute_graph_snapshot_hash'),
  ]);

  if (edgesError) {
    throw new Error(edgesError.message);
  }

  if (hashError) {
    throw new Error(hashError.message);
  }

  if (typeof hashData !== 'string') {
    throw new Error('Invalid graph snapshot hash');
  }

  const draft = detectFirstCycleSettlementForUser(
    (edges ?? []).flatMap((edge) => {
      if (typeof edge !== 'object' || edge === null || Array.isArray(edge)) {
        return [];
      }

      const debtorUserId = edge['debtor_user_id'];
      const creditorUserId = edge['creditor_user_id'];
      const amountMinor = parseAmountMinor(edge['amount_minor'], 'graph edge amount_minor');

      if (typeof debtorUserId !== 'string' || typeof creditorUserId !== 'string') {
        throw new Error('Invalid graph edge participants');
      }

      return [
        {
          debtor_user_id: debtorUserId,
          creditor_user_id: creditorUserId,
          amount_minor: amountMinor,
        },
      ];
    }),
    actorUserId,
  );

  if (!draft) {
    return null;
  }

  const { data, error } = await client.rpc('propose_cycle_settlement', {
    p_actor_user_id: actorUserId,
    p_idempotency_key: idempotencyKey,
    p_graph_snapshot_hash: hashData,
    p_graph_snapshot: edges ?? [],
    p_movements_json: draft.movements,
    p_participant_user_ids: draft.participantUserIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const status = data['status'];
    const proposalId = data['proposalId'];

    if (typeof status === 'string') {
      return {
        status,
        ...(typeof proposalId === 'string' ? { proposalId } : {}),
      };
    }
  }

  return null;
}
