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
      ['providers/session-provider.tsx', 40],
      ['providers/session-runtime/session-controller.tsx', 2000],
      ['features/balance/balance-lens-carousel.tsx', 1020],
      ['features/home/dashboard-screen.tsx', 620],
      ['features/invites/account-invite-entry-screen.tsx', 60],
      ['features/invites/account-invite-entry-flow.tsx', 1440],
      ['features/invites/account-create-account-screen.tsx', 640],
      ['features/invites/account-invite-screen.tsx', 470],
      ['features/home/add-person-contacts-sheet.tsx', 500],
      ['features/home/add-person-contacts-sheet-controller.ts', 520],
      ['features/profile/profile-screen.tsx', 20],
      ['features/profile/profile-screen-runtime.tsx', 1408],
      ['features/activity/activity-screen.tsx', 20],
      ['features/activity/activity-screen-runtime.tsx', 1280],
      ['features/onboarding/setup-account-screen.tsx', 20],
      ['features/onboarding/setup-account-screen-runtime.tsx', 1220],
      ['features/register/register-flow-screen.tsx', 20],
      ['features/register/register-flow-screen-runtime.tsx', 1210],
      ['features/people/person-detail-screen.tsx', 20],
      ['features/people/person-detail-screen-runtime.tsx', 1100],
      ['features/settlements/settlement-detail-screen.tsx', 20],
      ['features/settlements/settlement-detail-screen-runtime.tsx', 650],
      ['features/settlements/settlement-detail-screen-styles.ts', 190],
      ['features/transactions/transactions-screen.tsx', 20],
      ['features/transactions/transactions-screen-runtime.tsx', 600],
      ['features/transactions/transactions-screen-styles.ts', 100],
      ['features/categories/categories-index-screen.tsx', 20],
      ['features/categories/categories-index-screen-runtime.tsx', 390],
      ['features/categories/categories-index-screen-styles.ts', 160],
      ['components/pending-financial-request-card.tsx', 20],
      ['components/pending-financial-request-card-runtime.tsx', 400],
      ['components/pending-financial-request-card-styles.ts', 210],
      ['components/transaction-event-card.tsx', 20],
      ['components/transaction-event-card-runtime.tsx', 400],
      ['components/transaction-event-card-styles.ts', 180],
      ['components/brand-verification-lockup.tsx', 20],
      ['components/brand-verification-lockup-runtime.tsx', 500],
      ['components/brand-verification-lockup-styles.ts', 60],
      ['components/identity-flow.tsx', 20],
      ['components/identity-flow-runtime.tsx', 1000],
      ['lib/history-cases.ts', 20],
      ['lib/history-cases-runtime.ts', 160],
      ['lib/history-case-presentation.ts', 430],
      ['lib/history-case-helpers.ts', 240],
      ['lib/history-case-status.ts', 120],
      ['lib/history-case-types.ts', 60],
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
