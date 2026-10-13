import type { SignedAvatarUrlRecord } from '../avatar';
import type { PeopleOverview } from './types';

export interface CachedPeopleOverview {
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly overview: PeopleOverview;
  readonly updatedAt: string;
}

export interface PeopleOverviewCacheWriteOptions {
  readonly backendScope?: string;
  readonly assertCurrent?: () => void;
}

export async function readCachedPeopleOverview(
  _userId: string,
  _backendScope?: string,
): Promise<CachedPeopleOverview | null> {
  void _userId;
  void _backendScope;
  return null;
}

export async function persistCachedPeopleOverview(
  _userId: string,
  _overview: PeopleOverview,
  _avatarSignedUrlsByPath: SignedAvatarUrlRecord = {},
  options: PeopleOverviewCacheWriteOptions = {},
): Promise<void> {
  void _avatarSignedUrlsByPath;
  options.assertCurrent?.();
  return undefined;
}
