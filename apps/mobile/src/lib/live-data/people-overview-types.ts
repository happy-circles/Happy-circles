import type { PersonCardDto } from '@happy-circles/application';

import type { SignedAvatarUrlRecord } from '../avatar';

export interface PeopleOverview {
  readonly fetchedAt: string;
  readonly people: readonly PersonCardDto[];
}

export interface PeopleOverviewRow {
  readonly avatar_path: string | null;
  readonly avatar_updated_at: string | null;
  readonly direction: 'i_owe' | 'owes_me' | 'settled';
  readonly display_name: string;
  readonly last_activity_at: string | null;
  readonly net_amount_minor: number | string;
  readonly pending_count: number;
  readonly user_id: string;
}

export interface PeopleOverviewRows {
  readonly avatarSignedUrlsByPath: SignedAvatarUrlRecord;
  readonly fetchedAt: string;
  readonly people: readonly PeopleOverviewRow[];
  readonly serverTimingMs?: number;
}
