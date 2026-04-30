import type { SettlementProposalId, UserId } from '@happy-circles/shared';

export interface PairNetEdge {
  readonly debtorUserId: UserId;
  readonly creditorUserId: UserId;
  readonly amountMinor: number;
}

export interface CycleSettlementMovement {
  readonly debtorUserId: UserId;
  readonly creditorUserId: UserId;
  readonly amountMinor: number;
}

export interface CycleSettlementDraft {
  readonly proposalId: SettlementProposalId | string;
  readonly cycleNodes: readonly UserId[];
  readonly reducedEdges: readonly PairNetEdge[];
  readonly movements: readonly CycleSettlementMovement[];
  readonly amountMinor: number;
  readonly participantUserIds: readonly UserId[];
  readonly snapshotHash: string;
}

interface ParentStep {
  readonly previousNode: UserId;
  readonly edge: PairNetEdge;
}

interface MutableEdge {
  debtorUserId: UserId;
  creditorUserId: UserId;
  amountMinor: number;
}

type Adjacency = Map<UserId, readonly PairNetEdge[]>;

export function detectAnchoredCycleSettlementDraft(
  edges: readonly PairNetEdge[],
  anchorEdge: PairNetEdge,
): CycleSettlementDraft | null {
  if (anchorEdge.amountMinor <= 0) {
    return null;
  }

  const activeEdges = edges.filter((edge) => edge.amountMinor > 0);
  const adjacency = buildAdjacency(activeEdges);
  const thresholds = [
    ...new Set(
      activeEdges
        .map((edge) => edge.amountMinor)
        .filter((amountMinor) => amountMinor <= anchorEdge.amountMinor),
    ),
  ].sort((left, right) => left - right);

  let low = 0;
  let high = thresholds.length - 1;
  let bestThreshold: number | null = null;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const threshold = thresholds[midpoint]!;
    if (
      hasPathAtThreshold(
        anchorEdge.creditorUserId,
        anchorEdge.debtorUserId,
        threshold,
        adjacency,
      )
    ) {
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
    anchorEdge.creditorUserId,
    anchorEdge.debtorUserId,
    bestThreshold,
    adjacency,
  );
  if (!pathEdges) {
    return null;
  }

  return buildDraft([anchorEdge, ...pathEdges], Math.min(anchorEdge.amountMinor, bestThreshold), edges, 1);
}

export function detectCycleSettlementDrafts(
  edges: readonly PairNetEdge[],
  maxCycles = 5,
): readonly CycleSettlementDraft[] {
  const workingEdges: MutableEdge[] = edges
    .filter((edge) => edge.amountMinor > 0)
    .map((edge) => ({ ...edge }));
  const drafts: CycleSettlementDraft[] = [];

  while (drafts.length < maxCycles) {
    const draft = detectBestCycleSettlementDraft(workingEdges, drafts.length + 1);
    if (!draft) {
      break;
    }

    applyVirtualReduction(workingEdges, draft.reducedEdges, draft.amountMinor);
    drafts.push(draft);
  }

  return drafts;
}

export function hashEdges(edges: readonly PairNetEdge[]): string {
  const normalized = [...edges]
    .filter((edge) => edge.amountMinor > 0)
    .sort(compareEdges)
    .map((edge) => `${edge.debtorUserId}|${edge.creditorUserId}|${edge.amountMinor}`)
    .join(';');

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${hash >>> 0}:${normalized.length}`;
}

function detectBestCycleSettlementDraft(
  edges: readonly PairNetEdge[],
  draftNumber: number,
): CycleSettlementDraft | null {
  const candidateAnchors = [...edges]
    .filter((edge) => edge.amountMinor > 0)
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        left.debtorUserId.localeCompare(right.debtorUserId) ||
        left.creditorUserId.localeCompare(right.creditorUserId),
    );
  let best: CycleSettlementDraft | null = null;

  for (const anchor of candidateAnchors) {
    if (best && anchor.amountMinor < best.amountMinor) {
      break;
    }

    const draft = detectAnchoredCycleSettlementDraft(edges, anchor);
    if (!draft) {
      continue;
    }

    const numberedDraft = {
      ...draft,
      proposalId: `draft-${draftNumber}`,
    };

    if (!best || compareDrafts(numberedDraft, best) < 0) {
      best = numberedDraft;
    }
  }

  return best;
}

function buildDraft(
  cycleEdges: readonly PairNetEdge[],
  amountMinor: number,
  snapshotEdges: readonly PairNetEdge[],
  draftNumber: number,
): CycleSettlementDraft {
  const participantUserIds = [
    ...new Set(cycleEdges.flatMap((edge) => [edge.debtorUserId, edge.creditorUserId])),
  ].sort();

  return {
    proposalId: `draft-${draftNumber}`,
    cycleNodes: cycleEdges.map((edge) => edge.debtorUserId),
    reducedEdges: cycleEdges,
    amountMinor,
    participantUserIds,
    snapshotHash: hashEdges(snapshotEdges),
    movements: cycleEdges.map((edge) => ({
      debtorUserId: edge.creditorUserId,
      creditorUserId: edge.debtorUserId,
      amountMinor,
    })),
  };
}

function buildAdjacency(edges: readonly PairNetEdge[]): Adjacency {
  const adjacency = new Map<UserId, PairNetEdge[]>();

  for (const edge of edges) {
    const outgoing = adjacency.get(edge.debtorUserId) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.debtorUserId, outgoing);
  }

  for (const [node, outgoing] of adjacency.entries()) {
    adjacency.set(
      node,
      outgoing.sort(
        (left, right) =>
          left.creditorUserId.localeCompare(right.creditorUserId) ||
          right.amountMinor - left.amountMinor ||
          left.debtorUserId.localeCompare(right.debtorUserId),
      ),
    );
  }

  return adjacency;
}

function hasPathAtThreshold(
  startNode: UserId,
  targetNode: UserId,
  threshold: number,
  adjacency: Adjacency,
): boolean {
  const queue = [startNode];
  const visited = new Set<UserId>([startNode]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;

    for (const edge of adjacency.get(current) ?? []) {
      if (edge.amountMinor < threshold) {
        continue;
      }

      const next = edge.creditorUserId;
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
  startNode: UserId,
  targetNode: UserId,
  threshold: number,
  adjacency: Adjacency,
): readonly PairNetEdge[] | null {
  const queue = [startNode];
  const visited = new Set<UserId>([startNode]);
  const parents = new Map<UserId, ParentStep>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;

    for (const edge of adjacency.get(current) ?? []) {
      if (edge.amountMinor < threshold) {
        continue;
      }

      const next = edge.creditorUserId;
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
  startNode: UserId,
  targetNode: UserId,
  parents: Map<UserId, ParentStep>,
): readonly PairNetEdge[] {
  const path: PairNetEdge[] = [];
  let current = targetNode;

  while (current !== startNode) {
    const parent = parents.get(current);
    if (!parent) {
      throw new Error('Missing path parent while rebuilding cycle.');
    }

    path.push(parent.edge);
    current = parent.previousNode;
  }

  return path.reverse();
}

function applyVirtualReduction(
  workingEdges: MutableEdge[],
  cycle: readonly PairNetEdge[],
  amountMinor: number,
): void {
  for (const cycleEdge of cycle) {
    const edge = workingEdges.find(
      (candidate) =>
        candidate.debtorUserId === cycleEdge.debtorUserId &&
        candidate.creditorUserId === cycleEdge.creditorUserId,
    );
    if (edge) {
      edge.amountMinor -= amountMinor;
    }
  }

  for (let index = workingEdges.length - 1; index >= 0; index -= 1) {
    if (workingEdges[index]!.amountMinor <= 0) {
      workingEdges.splice(index, 1);
    }
  }
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

function compareEdges(left: PairNetEdge, right: PairNetEdge): number {
  return (
    left.debtorUserId.localeCompare(right.debtorUserId) ||
    left.creditorUserId.localeCompare(right.creditorUserId) ||
    left.amountMinor - right.amountMinor
  );
}
