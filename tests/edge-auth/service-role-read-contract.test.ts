import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function literalMatches(source: string, pattern: RegExp): string[] {
  return Array.from(source.matchAll(pattern), (match) => match[1]).filter(
    (value): value is string => Boolean(value),
  );
}

describe('service-role Edge read contract', () => {
  it('covers every direct snapshot and notification lookup with SELECT only', () => {
    const migration = read(
      'supabase/migrations/20260813020000_0079_new_user_backend_definitions.sql',
    );
    const snapshotSource = read('supabase/functions/get-app-snapshot/index.ts');
    const pushSource = read('supabase/functions/_shared/push-notifications.ts');
    const grantBlock = migration.match(
      /-- edge_service_role_read_contract:start([\s\S]*?)-- edge_service_role_read_contract:end/,
    )?.[1];

    expect(grantBlock).toBeDefined();

    const snapshotRelations = literalMatches(snapshotSource, /\.from\('([^']+)'\)/g).filter(
      (relation) => relation !== 'avatars',
    );
    const notificationLookups = literalMatches(pushSource, /findById\(\s*client,\s*'([^']+)'/g);
    const securityInvokerDependencies = [
      'ledger_accounts',
      'ledger_entries',
      'ledger_transactions',
      'pair_net_edges_cache',
    ];

    for (const relation of new Set([
      ...snapshotRelations,
      ...notificationLookups,
      ...securityInvokerDependencies,
    ])) {
      expect(grantBlock, `missing service_role SELECT contract for ${relation}`).toContain(
        `public.${relation}`,
      );
    }

    expect(grantBlock).not.toMatch(/grant\s+(?:all|insert|update|delete)/i);
  });
});
