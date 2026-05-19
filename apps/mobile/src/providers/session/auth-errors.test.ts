import { describe, expect, it } from 'vitest';

import { formatSupabaseAuthErrorMessage } from './auth-errors';

describe('auth error formatting', () => {
  it('maps Apple nonce failures to stable copy', () => {
    expect(formatSupabaseAuthErrorMessage('Nonces mismatch')).toBe(
      'No pudimos validar Apple. Intenta de nuevo.',
    );
    expect(
      formatSupabaseAuthErrorMessage(
        'Passed nonce and nonce in id_token should either both exist or not.',
      ),
    ).toBe('No pudimos validar Apple. Intenta de nuevo.');
  });

  it('maps identity linking failures to stable copy', () => {
    expect(formatSupabaseAuthErrorMessage('Manual linking is disabled')).toBe(
      'Ese metodo de acceso ya esta vinculado o la vinculacion no esta habilitada.',
    );
    expect(formatSupabaseAuthErrorMessage('identity_already_exists')).toBe(
      'Ese metodo de acceso ya esta vinculado o la vinculacion no esta habilitada.',
    );
  });
});
