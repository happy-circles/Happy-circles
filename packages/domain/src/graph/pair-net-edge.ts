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

type MutableEdge = {
  debtorUserId: UserId;
  creditorUserId: UserId;
  amountMinor: number;
};

export function detectCycleSettlementDrafts(
  edges: readonly PairNetEdge[],
  maxCycles = 5,
): readonly CycleSettlementDraft[] {
  const workingEdges = edges
    .filter((edge) => edge.amountMinor > 0)
    .map((edge) => ({ ...edge }));
  const drafts: CycleSettlementDraft[] = [];

  while (drafts.length < maxCycles) {
    const sccs = findStronglyConnectedComponents(workingEdges);
    const cycle = findDeterministicCycle(workingEdges, sccs);
    if (!cycle) {
      break;
    }

    const amountMinor = Math.min(...cycle.map((edge) => edge.amountMinor));
    const cycleNodes = cycle.map((edge) => edge.debtorUserId);
    const participantUserIds = [
      ...new Set([...cycleNodes, cycle[cycle.length - 1]!.creditorUserId]),
    ].sort();
    const movements = cycle.map<CycleSettlementMovement>((edge) => ({
      debtorUserId: edge.creditorUserId,
      creditorUserId: edge.debtorUserId,
      amountMinor,
    }));

    applyVirtualReduction(workingEdges, cycle, amountMinor);

    drafts.push({
      proposalId: `draft-${drafts.length + 1}`,
      cycleNodes,
      reducedEdges: cycle,
      movements,
      amountMinor,
      participantUserIds,
      snapshotHash: hashEdges(edges),
    });
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

function findStronglyConnectedComponents(
  edges: readonly PairNetEdge[],
): readonly UserId[][] {
  const nodes = [...new Set(edges.flatMap((edge) => [edge.debtorUserId, edge.creditorUserId]))].sort();
  const adjacency = new Map<UserId, UserId[]>();
  for (const node of nodes) {
    adjacency.set(node, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.debtorUserId)?.push(edge.creditorUserId);
  }

  for (const [node, neighbors] of adjacency.entries()) {
    adjacency.set(node, [...neighbors].sort());
  }

  const indices = new Map<UserId, number>();
  const lowLinks = new Map<UserId, number>();
  const stack: UserId[] = [];
  const onStack = new Set<UserId>();
  const components: UserId[][] = [];
  let currentIndex = 0;

  const strongConnect = (node: UserId): void => {
    indices.set(node, currentIndex);
    lowLinks.set(node, currentIndex);
    currentIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(neighbor)!));
      }
    }

    if (lowLinks.get(node) === indices.get(node)) {
      const component: UserId[] = [];
      while (stack.length > 0) {
        const member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
        if (member === node) {
          break;
        }
      }

      if (component.length > 1) {
        components.push(component.sort());
      }
    }
  };

  for (const node of nodes) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return components.sort((left, right) => left.join('|').localeCompare(right.join('|')));
}

function findDeterministicCycle(
  edges: readonly PairNetEdge[],
  components: readonly UserId[][],
): readonly PairNetEdge[] | undefined {
  const edgeIndex = new Map<string, PairNetEdge>();
  for (const edge of edges) {
    edgeIndex.set(`${edge.debtorUserId}->${edge.creditorUserId}`, edge);
  }

  const cycles: PairNetEdge[][] = [];

  for (const component of components) {
    const nodes = [...component].sort();
    const nodeSet = new Set(nodes);
    const adjacency = new Map<UserId, UserId[]>();

    for (const node of nodes) {
      adjacency.set(node, []);
    }

    for (const edge of edges) {
      if (nodeSet.has(edge.debtorUserId) && nodeSet.has(edge.creditorUserId)) {
        adjacency.get(edge.debtorUserId)?.push(edge.creditorUserId);
      }
    }

    for (const [node, neighbors] of adjacency.entries()) {
      adjacency.set(node, [...neighbors].sort());
    }

    for (const start of nodes) {
      const path: UserId[] = [start];
      const visited = new Set<UserId>([start]);

      const dfs = (current: UserId): void => {
        for (const next of adjacency.get(current) ?? []) {
          if (next === start && path.length >= 3) {
            cycles.push(toEdges(path, edgeIndex));
            continue;
          }

          if (visited.has(next)) {
            continue;
          }

          visited.add(next);
          path.push(next);
          dfs(next);
          path.pop();
          visited.delete(next);
        }
      };

      dfs(start);
    }
  }

  if (cycles.length === 0) {
    return undefined;
  }

  return cycles
    .map((cycle) => ({ cycle, key: canonicalCycleKey(cycle) }))
    .sort((left, right) => left.key.localeCompare(right.key))[0]?.cycle;
}

function toEdges(
  cycleNodes: readonly UserId[],
  edgeIndex: Map<string, PairNetEdge>,
): PairNetEdge[] {
  const edges: PairNetEdge[] = [];

  for (let index = 0; index < cycleNodes.length; index += 1) {
    const from = cycleNodes[index]!;
    const to = cycleNodes[(index + 1) % cycleNodes.length]!;
    const edge = edgeIndex.get(`${from}->${to}`);
    if (!edge) {
      throw new Error(`Missing edge ${from}->${to} while rebuilding cycle.`);
    }
    edges.push(edge);
  }

  return edges;
}

function canonicalCycleKey(cycle: readonly PairNetEdge[]): string {
  const nodes = cycle.map((edge) => edge.debtorUserId);
  let smallestIndex = 0;

  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index]!.localeCompare(nodes[smallestIndex]!) < 0) {
      smallestIndex = index;
    }
  }

  const rotated = nodes.slice(smallestIndex).concat(nodes.slice(0, smallestIndex));
  return rotated.join('>');
}

function compareEdges(left: PairNetEdge, right: PairNetEdge): number {
  return (
    left.debtorUserId.localeCompare(right.debtorUserId) ||
    left.creditorUserId.localeCompare(right.creditorUserId) ||
    left.amountMinor - right.amountMinor
  );
}
