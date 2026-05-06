import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const srcRoot = dirname(fileURLToPath(import.meta.url));

function readSource(...segments: string[]): string {
  return readFileSync(resolve(srcRoot, ...segments), 'utf8');
}

function lineCount(...segments: string[]): number {
  return readSource(...segments).split(/\r?\n/).length;
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(fullPath) && !fullPath.endsWith('.test.ts') ? [fullPath] : [];
  });
}

describe('mobile architecture boundaries', () => {
  it('keeps the current large orchestrators from growing without an explicit split', () => {
    const budgets = new Map<string, number>([
      ['providers/session-provider.tsx', 2000],
      ['features/balance/balance-overview-screen.tsx', 1850],
      ['features/home/dashboard-screen.tsx', 1650],
      ['features/invites/account-invite-entry-screen.tsx', 1620],
      ['features/home/add-person-contacts-sheet.tsx', 1600],
      ['features/profile/profile-screen.tsx', 1450],
      ['features/activity/activity-screen.tsx', 1300],
      ['features/onboarding/setup-account-screen.tsx', 1220],
      ['features/register/register-flow-screen.tsx', 1220],
      ['features/people/person-detail-screen.tsx', 1120],
      ['components/identity-flow.tsx', 1000],
    ]);

    for (const [path, maxLines] of budgets) {
      expect(lineCount(...path.split('/')), path).toBeLessThanOrEqual(maxLines);
    }
  });

  it('keeps extracted helpers free of runtime UI, data client and provider dependencies', () => {
    const helperFiles = listTypeScriptFiles(srcRoot).filter((file) => {
      const normalized = relative(srcRoot, file).replace(/\\/g, '/');
      return normalized.endsWith('-helpers.ts') || normalized.startsWith('providers/session/');
    });

    for (const file of helperFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"]react['"]/);
      expect(source, file).not.toMatch(/from ['"]react-native['"]/);
      expect(source, file).not.toMatch(/@tanstack\/react-query/);
      expect(source, file).not.toMatch(/^import\s+(?!type\b).*from ['"].*supabase/m);
      expect(source, file).not.toMatch(/providers\/session-provider/);
      expect(source, file).not.toMatch(/use(Query|Mutation|Session)\b/);
    }
  });
});
