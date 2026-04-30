export interface PairNetEdge {
  debtor_user_id: string;
  creditor_user_id: string;
  amount_minor: number;
}

export interface CycleSettlementDraft {
  cycleNodes: string[];
  participantUserIds: string[];
  amountMinor: number;
  movements: Array<{
    debtor_user_id: string;
    creditor_user_id: string;
    amount_minor: number;
  }>;
}

interface ParentStep {
  previousNode: string;
  edge: PairNetEdge;
}

type Adjacency = Map<string, PairNetEdge[]>;

export function parseAmountMinor(value: unknown, field: string): number {
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

export function detectBestAnchoredCycleSettlement(
  edges: PairNetEdge[],
  anchorEdge: PairNetEdge,
): CycleSettlementDraft | null {
  const activeEdges = edges.filter((edge) => edge.amount_minor > 0);
  if (anchorEdge.amount_minor <= 0) {
    return null;
  }

  const adjacency = buildAdjacency(activeEdges);
  const startNode = anchorEdge.creditor_user_id;
  const targetNode = anchorEdge.debtor_user_id;
  const thresholds = [
    ...new Set(
      activeEdges
        .map((edge) => edge.amount_minor)
        .filter((amountMinor) => amountMinor <= anchorEdge.amount_minor),
    ),
  ].sort((left, right) => left - right);

  if (thresholds.length === 0) {
    return null;
  }

  let low = 0;
  let high = thresholds.length - 1;
  let bestThreshold: number | null = null;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const threshold = thresholds[midpoint]!;
    if (hasPathAtThreshold(startNode, targetNode, threshold, adjacency)) {
      bestThreshold = threshold;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  if (bestThreshold === null) {
    return null;
  }

  const pathEdges = findShortestPathAtThreshold(
    startNode,
    targetNode,
    bestThreshold,
    adjacency,
  );
  if (!pathEdges) {
    return null;
  }

  const cycleEdges = [anchorEdge, ...pathEdges];
  const amountMinor = Math.min(anchorEdge.amount_minor, bestThreshold);
  const participantUserIds = [
    ...new Set(cycleEdges.flatMap((edge) => [edge.debtor_user_id, edge.creditor_user_id])),
  ].sort();

  return {
    cycleNodes: cycleEdges.map((edge) => edge.debtor_user_id),
    participantUserIds,
    amountMinor,
    movements: cycleEdges.map((edge) => ({
      debtor_user_id: edge.creditor_user_id,
      creditor_user_id: edge.debtor_user_id,
      amount_minor: amountMinor,
    })),
  };
}

export function detectFirstCycleSettlement(edges: PairNetEdge[]): CycleSettlementDraft | null {
  return detectFirstCycleSettlementForUser(edges);
}

export function detectFirstCycleSettlementForUser(
  edges: PairNetEdge[],
  requiredUserId?: string,
): CycleSettlementDraft | null {
  const candidateAnchors = edges
    .filter(
      (edge) =>
        edge.amount_minor > 0 &&
        (!requiredUserId ||
          edge.debtor_user_id === requiredUserId ||
          edge.creditor_user_id === requiredUserId),
    )
    .sort(
      (left, right) =>
        right.amount_minor - left.amount_minor ||
        left.debtor_user_id.localeCompare(right.debtor_user_id) ||
        left.creditor_user_id.localeCompare(right.creditor_user_id),
    );

  let best: CycleSettlementDraft | null = null;

  for (const anchor of candidateAnchors) {
    if (best && anchor.amount_minor < best.amountMinor) {
      break;
    }

    const draft = detectBestAnchoredCycleSettlement(edges, anchor);
    if (!draft || (requiredUserId && !draft.participantUserIds.includes(requiredUserId))) {
      continue;
    }

    if (!best || compareDrafts(draft, best) < 0) {
      best = draft;
    }
  }

  return best;
}

function buildAdjacency(edges: PairNetEdge[]): Adjacency {
  const adjacency: Adjacency = new Map();

  for (const edge of edges) {
    const outgoing = adjacency.get(edge.debtor_user_id) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.debtor_user_id, outgoing);
  }

  for (const [node, outgoing] of adjacency.entries()) {
    adjacency.set(
      node,
      outgoing.sort(
        (left, right) =>
          left.creditor_user_id.localeCompare(right.creditor_user_id) ||
          right.amount_minor - left.amount_minor ||
          left.debtor_user_id.localeCompare(right.debtor_user_id),
      ),
    );
  }

  return adjacency;
}

function hasPathAtThreshold(
  startNode: string,
  targetNode: string,
  threshold: number,
  adjacency: Adjacency,
): boolean {
  if (startNode === targetNode) {
    return true;
  }

  const queue = [startNode];
  const visited = new Set([startNode]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const edge of adjacency.get(current) ?? []) {
      if (edge.amount_minor < threshold) {
        continue;
      }

      const next = edge.creditor_user_id;
      if (next === targetNode) {
        return true;
      }

      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

function findShortestPathAtThreshold(
  startNode: string,
  targetNode: string,
  threshold: number,
  adjacency: Adjacency,
): PairNetEdge[] | null {
  const queue = [startNode];
  const visited = new Set([startNode]);
  const parents = new Map<string, ParentStep>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;

    for (const edge of adjacency.get(current) ?? []) {
      if (edge.amount_minor < threshold) {
        continue;
      }

      const next = edge.creditor_user_id;
      if (visited.has(next)) {
        continue;
      }

      parents.set(next, {
        previousNode: current,
        edge,
      });

      if (next === targetNode) {
        return rebuildPath(startNode, targetNode, parents);
      }

      visited.add(next);
      queue.push(next);
    }
  }

  return null;
}

function rebuildPath(
  startNode: string,
  targetNode: string,
  parents: Map<string, ParentStep>,
): PairNetEdge[] {
  const path: PairNetEdge[] = [];
  let current = targetNode;

  while (current !== startNode) {
    const parent = parents.get(current);
    if (!parent) {
      throw new Error('Missing path parent while rebuilding cycle');
    }

    path.push(parent.edge);
    current = parent.previousNode;
  }

  return path.reverse();
}

function compareDrafts(left: CycleSettlementDraft, right: CycleSettlementDraft): number {
  return (
    right.amountMinor - left.amountMinor ||
    left.participantUserIds.length - right.participantUserIds.length ||
    canonicalCycleKey(left).localeCompare(canonicalCycleKey(right))
  );
}

function canonicalCycleKey(draft: CycleSettlementDraft): string {
  const nodes = draft.cycleNodes;
  let smallestIndex = 0;

  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index]!.localeCompare(nodes[smallestIndex]!) < 0) {
      smallestIndex = index;
    }
  }

  return nodes.slice(smallestIndex).concat(nodes.slice(0, smallestIndex)).join('>');
}
