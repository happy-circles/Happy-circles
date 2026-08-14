import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const flowSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'account-invite-entry-flow.tsx'),
  'utf8',
);

function sourceBetween(start: string, end: string): string {
  const startIndex = flowSource.indexOf(start);
  const endIndex = flowSource.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return flowSource.slice(startIndex, endIndex);
}

describe('account invite entry sign-in contract', () => {
  it('clears ignored token state and route params before completing sign-in', () => {
    const preparationSource = sourceBetween(
      'const pendingTokenPreparation = usePendingAccountInviteTokenPreparation(',
      'const authRequestBusy',
    );

    expect(preparationSource).toMatch(
      /onIgnored: \(\) => \{[\s\S]*setTokenInput\(''\);[\s\S]*setTokenTouched\(false\);[\s\S]*setTokenMessage\(null\);[\s\S]*router\.setParams\(\{ mode: 'sign-in', token: undefined \}\);[\s\S]*\}/,
    );
    expect(preparationSource).not.toContain('completeSuccessfulSignIn');

    const automaticPreparationIndex = flowSource.indexOf('void pendingTokenPreparation');
    const automaticCompletionIndex = flowSource.indexOf(
      'completeSuccessfulSignIn()',
      automaticPreparationIndex,
    );
    const rememberedSignInSource = sourceBetween(
      'async function handleContinue(',
      'useEffect(() =>',
    );

    expect(automaticPreparationIndex).toBeGreaterThanOrEqual(0);
    expect(automaticCompletionIndex).toBeGreaterThan(automaticPreparationIndex);
    expect(flowSource.indexOf('.prepare()', automaticPreparationIndex)).toBeLessThan(
      automaticCompletionIndex,
    );
    expect(rememberedSignInSource.indexOf('await pendingTokenPreparation.prepare()')).toBeLessThan(
      rememberedSignInSource.indexOf('session.unlock()'),
    );
    const unlockIndex = rememberedSignInSource.indexOf('session.unlock()');
    const reconciliationIndex = rememberedSignInSource.indexOf(
      'pendingTokenPreparation.reconcile(attempt)',
    );
    expect(reconciliationIndex).toBeGreaterThan(unlockIndex);
    expect(reconciliationIndex).toBeLessThan(
      rememberedSignInSource.indexOf('if (!result.success)'),
    );
    expect(reconciliationIndex).toBeLessThan(
      rememberedSignInSource.indexOf('completeSuccessfulSignIn()'),
    );
  });

  it('prepares the token before password or social auth can run', () => {
    const socialSignInSource = sourceBetween(
      'async function handleSocialSignIn(',
      'async function handlePasswordSignIn()',
    );
    const passwordSignInSource = sourceBetween(
      'async function handlePasswordSignIn()',
      'async function handlePasswordRecovery()',
    );

    expect(socialSignInSource.indexOf('await pendingTokenPreparation.prepare()')).toBeLessThan(
      socialSignInSource.indexOf('session.signInWithGoogle()'),
    );
    const socialReconciliationIndex = socialSignInSource.indexOf(
      'pendingTokenPreparation.reconcile(attempt)',
    );
    expect(socialReconciliationIndex).toBeGreaterThan(
      socialSignInSource.indexOf('session.signInWithGoogle()'),
    );
    expect(socialReconciliationIndex).toBeLessThan(
      socialSignInSource.indexOf('if (signInSucceeded)', socialReconciliationIndex),
    );
    expect(socialReconciliationIndex).toBeLessThan(
      socialSignInSource.indexOf('completeSuccessfulSignIn()'),
    );
    expect(passwordSignInSource.indexOf('await pendingTokenPreparation.prepare()')).toBeLessThan(
      passwordSignInSource.indexOf('session.signInWithPassword'),
    );
    const passwordReconciliationIndex = passwordSignInSource.indexOf(
      'pendingTokenPreparation.reconcile(attempt)',
    );
    expect(passwordReconciliationIndex).toBeGreaterThan(
      passwordSignInSource.indexOf('session.signInWithPassword'),
    );
    expect(passwordReconciliationIndex).toBeLessThan(
      passwordSignInSource.indexOf('if (signInSucceeded)', passwordReconciliationIndex),
    );
    expect(passwordReconciliationIndex).toBeLessThan(
      passwordSignInSource.indexOf('completeSuccessfulSignIn()'),
    );
  });
});
