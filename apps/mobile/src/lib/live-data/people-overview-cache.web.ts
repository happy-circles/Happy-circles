import type { SignedAvatarUrlRecord } from '../avatar';
import type { PeopleOverview } from './types';

export interface CachedPeopleOverview {
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly overview: PeopleOverview;
  readonly updatedAt: string;
}

export async function readCachedPeopleOverview(): Promise<CachedPeopleOverview | null> {
  return null;
}

export async function persistCachedPeopleOverview(): Promise<void> {
  return undefined;
}
