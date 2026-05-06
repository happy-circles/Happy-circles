import type { UserProfileRow, RelationshipRow } from '../types';

export interface LiveSnapshotContext {
  readonly nameByUserId: Map<string, string>;
  readonly profileByUserId: Map<string, UserProfileRow>;
  readonly relationshipsByCounterpartyId: Map<string, RelationshipRow>;
  readonly counterpartyByRelationshipId: Map<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >;
  readonly visibleRelationshipIds: Set<string>;
  readonly visibleCounterpartyUserIds: Set<string>;
}

export function getCounterpartyUserId(
  relationship: RelationshipRow,
  currentUserId: string,
): string | null {
  if (relationship.user_low_id === currentUserId) {
    return relationship.user_high_id;
  }

  if (relationship.user_high_id === currentUserId) {
    return relationship.user_low_id;
  }

  return null;
}

export function groupBy<K extends string, V>(
  items: readonly V[],
  getKey: (item: V) => K,
): Map<K, V[]> {
  const grouped = new Map<K, V[]>();

  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
      continue;
    }

    grouped.set(key, [item]);
  }

  return grouped;
}

export function buildNameByUserId(
  profiles: readonly UserProfileRow[],
  currentUserId: string,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const profile of profiles) {
    names.set(profile.id, profile.id === currentUserId ? 'Tu' : profile.display_name);
  }

  return names;
}

export function buildProfileByUserId(
  profiles: readonly UserProfileRow[],
): Map<string, UserProfileRow> {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

export function buildLiveSnapshotContext(input: {
  readonly currentUserId: string;
  readonly profiles: readonly UserProfileRow[];
  readonly relationships: readonly RelationshipRow[];
}): LiveSnapshotContext {
  const nameByUserId = buildNameByUserId(input.profiles, input.currentUserId);
  const profileByUserId = buildProfileByUserId(input.profiles);
  const relationshipsByCounterpartyId = new Map<string, RelationshipRow>();
  const counterpartyByRelationshipId = new Map<
    string,
    {
      readonly userId: string;
      readonly displayName: string;
    }
  >();

  for (const relationship of input.relationships) {
    const counterpartyUserId = getCounterpartyUserId(relationship, input.currentUserId);
    if (counterpartyUserId) {
      relationshipsByCounterpartyId.set(counterpartyUserId, relationship);
      counterpartyByRelationshipId.set(relationship.id, {
        userId: counterpartyUserId,
        displayName: nameByUserId.get(counterpartyUserId) ?? 'Persona',
      });
    }
  }

  return {
    nameByUserId,
    profileByUserId,
    relationshipsByCounterpartyId,
    counterpartyByRelationshipId,
    visibleRelationshipIds: new Set(input.relationships.map((relationship) => relationship.id)),
    visibleCounterpartyUserIds: new Set(relationshipsByCounterpartyId.keys()),
  };
}
