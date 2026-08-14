import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/storage', () => ({
  getStoredItem: vi.fn(),
  removeStoredItem: vi.fn(),
  setStoredItem: vi.fn(),
}));

import { resolveRememberedAccountDisplayName } from './remembered-account';

describe('remembered account', () => {
  it('keeps incomplete accounts visible with a stable fallback label', () => {
    expect(resolveRememberedAccountDisplayName('', 'samuel@example.com')).toBe('samuel');
    expect(resolveRememberedAccountDisplayName('   ', null)).toBe('Tu cuenta');
    expect(resolveRememberedAccountDisplayName('  Samuel  ', 'other@example.com')).toBe('Samuel');
  });
});
