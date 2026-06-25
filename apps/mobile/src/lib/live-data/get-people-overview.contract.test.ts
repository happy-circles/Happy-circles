import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
const functionSource = readFileSync(
  resolve(repoRoot, 'supabase/functions/get-people-overview/index.ts'),
  'utf8',
);
const migrationSource = readFileSync(
  resolve(repoRoot, 'supabase/migrations/0068_people_overview_read_model.sql'),
  'utf8',
);
const configSource = readFileSync(resolve(repoRoot, 'supabase/config.toml'), 'utf8');
const fetcherSource = readFileSync(
  resolve(repoRoot, 'apps/mobile/src/lib/live-data/people-overview-fetcher.ts'),
  'utf8',
);

describe('get-people-overview contract', () => {
  it('registers an authenticated lightweight Edge Function', () => {
    expect(configSource).toMatch(/\[functions\.get-people-overview\][\s\S]*verify_jwt\s*=\s*true/);
    expect(functionSource).toContain('handleRpc(request');
    expect(functionSource).toContain("'get_people_overview_rows'");
    expect(functionSource).not.toContain("'get-app-snapshot'");
  });

  it('uses a bounded aggregate read model instead of loading full histories in JavaScript', () => {
    expect(migrationSource).toContain('create or replace function public.get_people_overview_rows');
    expect(migrationSource).toContain('select distinct on (history.relationship_id)');
    expect(migrationSource).toContain('financial_requests_pending_relationship_idx');
    expect(migrationSource).toContain('grant execute on function');
    expect(functionSource).not.toContain(".from('financial_requests')");
    expect(functionSource).not.toContain(".from('v_relationship_history')");
  });

  it('persists the compact response before returning it to React Query', () => {
    expect(fetcherSource).toContain("'get-people-overview'");
    expect(fetcherSource).toContain('await persistCachedPeopleOverview');
    expect(fetcherSource).toContain('hydrateSignedAvatarUrlCache');
  });
});
