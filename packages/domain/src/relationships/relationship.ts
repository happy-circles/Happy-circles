import type { RelationshipId, UserId } from '@happy-circles/shared';

import { DomainError } from '../common/domain-error';
import { toCanonicalPair } from '../common/identity';

export interface RelationshipInvite {
  readonly inviterUserId: UserId;
  readonly inviteeUserId: UserId;
}

export interface Relationship {
  readonly id: RelationshipId;
  readonly userLowId: UserId;
  readonly userHighId: UserId;
  readonly active: boolean;
}

export function createRelationship(id: RelationshipId, left: UserId, right: UserId): Relationship {
  if (left === right) {
    throw new DomainError(
      'relationship.self_reference',
      'A relationship must exist between two different users.',
    );
  }

  const pair = toCanonicalPair(left, right);

  return {
    id,
    userLowId: pair.userLowId,
    userHighId: pair.userHighId,
    active: true,
  };
}

export function relationshipIncludesUser(relationship: Relationship, userId: UserId): boolean {
  return relationship.userLowId === userId || relationship.userHighId === userId;
}
