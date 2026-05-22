import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
const sharedHttpSource = readFileSync(
  resolve(repoRoot, 'supabase/functions/_shared/http.ts'),
  'utf8',
);

describe('Edge Function shared HTTP contract', () => {
  it('handles browser preflight requests for app RPC calls', () => {
    expect(sharedHttpSource).toContain("'access-control-allow-origin': '*'");
    expect(sharedHttpSource).toContain("'access-control-allow-methods': 'POST, OPTIONS'");
    expect(sharedHttpSource).toContain('authorization, x-client-info, apikey, content-type');
    expect(sharedHttpSource).toMatch(/request\.method === 'OPTIONS'[\s\S]*preflightResponse/);
    expect(sharedHttpSource.match(/request\.method === 'OPTIONS'/g)).toHaveLength(2);
  });
});
