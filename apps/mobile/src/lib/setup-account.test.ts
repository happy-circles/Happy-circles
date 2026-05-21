import { describe, expect, it } from 'vitest';

import {
  isEmailLocalPartDisplayName,
  resolveInitialSetupFullName,
} from './setup-account';

describe('setup account helpers', () => {
  it('treats the generated email local part as an empty onboarding name', () => {
    expect(
      resolveInitialSetupFullName({
        displayName: 'ana',
        email: 'ana@example.com',
      }),
    ).toBe('');
  });

  it('keeps real profile names when pre-filling onboarding', () => {
    expect(
      resolveInitialSetupFullName({
        displayName: 'Ana Torres',
        email: 'ana@example.com',
      }),
    ).toBe('Ana Torres');
  });

  it('matches generated email local parts case-insensitively', () => {
    expect(
      isEmailLocalPartDisplayName({
        displayName: 'ANA',
        email: 'ana@example.com',
      }),
    ).toBe(true);
  });
});
