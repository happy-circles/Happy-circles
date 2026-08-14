import { describe, expect, it } from 'vitest';

import { isProjectApiKeyBearer } from '../../supabase/functions/_shared/project-api-key';

describe('isProjectApiKeyBearer', () => {
  it('recognizes the configured anonymous key and the request apikey', () => {
    expect(isProjectApiKeyBearer('anon-key', null, 'anon-key')).toBe(true);
    expect(isProjectApiKeyBearer('publishable-key', ' publishable-key ', 'anon-key')).toBe(true);
  });

  it('does not downgrade a user JWT or an unrelated publishable-looking bearer', () => {
    expect(isProjectApiKeyBearer('user.jwt.value', 'anon-key', 'anon-key')).toBe(false);
    expect(isProjectApiKeyBearer('sb_publishable_other', null, 'anon-key')).toBe(false);
    expect(isProjectApiKeyBearer('sb_publishable_other', 'anon-key', 'anon-key')).toBe(false);
  });

  it('does not consider empty configured or request keys anonymous', () => {
    expect(isProjectApiKeyBearer('', null, '')).toBe(false);
    expect(isProjectApiKeyBearer('', '   ', '')).toBe(false);
  });
});
