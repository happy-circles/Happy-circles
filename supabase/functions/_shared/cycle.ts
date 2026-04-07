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

export function detectFirstCycleSettlement(edges: PairNetEdge[]): CycleSettlementDraft | null {
  const workingEdges = edges
    .filter((edge) => edge.amount_minor > 0)
    .map((edge) => ({ ...edge }));

  const cycle = findCycle(workingEdges);
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

function findCycle(edges: PairNetEdge[]): PairNetEdge[] | null {
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
    .map((cycle) => ({ cycle, key: canonicalCycleKey(cycle) }))
    .sort((left, right) => left.key.localeCompare(right.key))[0]!.cycle;
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
