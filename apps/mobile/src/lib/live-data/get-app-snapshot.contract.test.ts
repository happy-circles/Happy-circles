import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
const functionSource = readFileSync(
  resolve(repoRoot, 'supabase/functions/get-app-snapshot/index.ts'),
  'utf8',
);
const configSource = readFileSync(resolve(repoRoot, 'supabase/config.toml'), 'utf8');
const mobileFetcherSource = readFileSync(
  resolve(repoRoot, 'apps/mobile/src/lib/live-data/fetch-snapshot.ts'),
  'utf8',
);

describe('get-app-snapshot contract', () => {
  it('is registered as an authenticated Edge Function', () => {
    expect(configSource).toMatch(/\[functions\.get-app-snapshot\][\s\S]*verify_jwt\s*=\s*true/);
    expect(functionSource).toContain('handleRpc(request');
  });

  it('uses explicit selects and actor-scoped reads', () => {
    expect(functionSource).not.toMatch(/select\(\s*['"`]\*['"`]\s*\)/);
    expect(functionSource).toContain('actorUserId');
    expect(functionSource).toContain(".eq('owner_user_id', actorUserId)");
    expect(functionSource).toContain(
      ".eq('settlement_proposal_participants.participant_user_id', actorUserId)",
    );
    expect(functionSource).toContain(".from('happy_circle_score_events')");
    expect(functionSource).toContain(".eq('user_id', actorUserId)");
    expect(functionSource).toContain(".eq('actor_user_id', actorUserId)");
    expect(functionSource).toContain('participantScope(actorUserId)');
    expect(functionSource).toContain('friendshipScope(actorUserId)');
    expect(functionSource).toContain('accountInviteScope(actorUserId)');
  });

  it('bounds historical reads while keeping active reads independent from history limits', () => {
    expect(functionSource).toContain('financialRequestHistory: 250');
    expect(functionSource).toContain('relationshipHistory: 300');
    expect(functionSource).toContain('friendshipInviteHistory: 150');
    expect(functionSource).toContain('accountInviteHistory: 150');
    expect(functionSource).toContain('settlementHistory: 100');
    expect(functionSource).toContain('auditEvents: 20');
    expect(functionSource).toContain('notificationViews: 1000');

    expect(functionSource).toContain(".eq('status', 'pending')");
    expect(functionSource).toContain(".neq('status', 'pending')");
    expect(functionSource).toContain('.limit(LIMITS.financialRequestHistory)');
    expect(functionSource).toContain(".in('status', ACTIVE_FRIENDSHIP_INVITE_STATUSES)");
    expect(functionSource).toContain(".in('status', HISTORY_FRIENDSHIP_INVITE_STATUSES)");
    expect(functionSource).toContain('.limit(LIMITS.friendshipInviteHistory)');
    expect(functionSource).toContain(".in('status', ACTIVE_ACCOUNT_INVITE_STATUSES)");
    expect(functionSource).toContain(".in('status', HISTORY_ACCOUNT_INVITE_STATUSES)");
    expect(functionSource).toContain('.limit(LIMITS.accountInviteHistory)');
    expect(functionSource).toContain(".in('status', ACTIVE_SETTLEMENT_STATUSES)");
    expect(functionSource).toContain(".in('status', HISTORY_SETTLEMENT_STATUSES)");
    expect(functionSource).toContain('.limit(LIMITS.settlementHistory)');
    expect(functionSource).not.toContain("'actor_settlement_participants'");
  });

  it('keeps mobile snapshot reads behind the single BFF call', () => {
    expect(mobileFetcherSource).toContain("'get-app-snapshot'");
    expect(mobileFetcherSource).not.toContain('.from(');
    expect(mobileFetcherSource).not.toContain('Promise.all([');
  });

  it('returns private avatar signed URLs in the snapshot contract', () => {
    expect(functionSource).toContain('avatarSignedUrlsByPath');
    expect(functionSource).toContain(".from('avatars')");
    expect(functionSource).toContain('.createSignedUrl(path');
    expect(functionSource).not.toContain('.getPublicUrl(');
    expect(mobileFetcherSource).toContain('hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath)');
  });
});
