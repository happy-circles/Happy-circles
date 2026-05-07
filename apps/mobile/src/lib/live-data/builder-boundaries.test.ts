import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const liveDataRoot = dirname(fileURLToPath(import.meta.url));

function readRepoFile(...segments: string[]): string {
  return readFileSync(resolve(liveDataRoot, ...segments), 'utf8');
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return fullPath.endsWith('.ts') && !fullPath.endsWith('.test.ts') ? [fullPath] : [];
  });
}

describe('live-data builder boundaries', () => {
  it('keeps build-snapshot as a compact composer', () => {
    const source = readRepoFile('build-snapshot.ts');

    expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(250);
    expect(source).toContain('export function buildLiveSnapshot');
    expect(source).not.toContain('function buildFriendshipInviteItems');
    expect(source).not.toContain('function buildBalanceAnalytics');
  });

  it('keeps public builder entrypoints compact', () => {
    const budgets = new Map<string, number>([
      ['builders/balance-analytics.ts', 20],
      ['builders/balance-analytics-runtime.ts', 500],
      ['builders/financial-requests.ts', 20],
      ['builders/financial-requests-runtime.ts', 420],
      ['builders/friendship-invites.ts', 20],
      ['builders/friendship-invites-runtime.ts', 500],
      ['builders/settlements.ts', 20],
      ['builders/settlements-runtime.ts', 430],
      ['snapshot-types.ts', 120],
      ['types.ts', 20],
      ['types-runtime.ts', 470],
    ]);

    for (const [path, maxLines] of budgets) {
      expect(readRepoFile(...path.split('/')).split(/\r?\n/).length, path).toBeLessThanOrEqual(
        maxLines,
      );
    }
  });

  it('keeps pure builders and utilities away from React, React Query and Supabase', () => {
    const files = [
      ...listTypeScriptFiles(resolve(liveDataRoot, 'builders')),
      ...listTypeScriptFiles(resolve(liveDataRoot, 'utils')),
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"]react['"]/);
      expect(source, file).not.toMatch(/@tanstack\/react-query/);
      expect(source, file).not.toMatch(/from ['"].*supabase/);
      expect(source, file).not.toMatch(/use(Query|Mutation)\b/);
    }
  });

  it('keeps mutations as a compact domain barrel', () => {
    const source = readRepoFile('mutations.ts');

    expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(50);
    expect(source).not.toMatch(/use(Query|Mutation)\b/);
    expect(source).not.toMatch(/invokeSupabaseFunction/);
    expect(source).toContain("from './mutations/financial-requests'");
    expect(source).toContain("from './mutations/friendship-invites'");
  });

  it('keeps mutation modules from depending on snapshot builders except notifications', () => {
    const files = listTypeScriptFiles(resolve(liveDataRoot, 'mutations'));

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (file.endsWith(`${join('mutations', 'notifications.ts')}`)) {
        expect(source, file).toContain('../builders/notifications');
      } else {
        expect(source, file).not.toMatch(/\.\.\/builders\//);
      }
    }
  });
});
