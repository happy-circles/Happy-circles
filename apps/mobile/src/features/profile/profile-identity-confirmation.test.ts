import { describe, expect, it, vi } from 'vitest';

import { IdentityConfirmationCancelledError } from '@/lib/live-data/mutations/sensitive-action-check';
import { confirmProfileIdentity } from './profile-identity-confirmation';

const confirmation = { actionLabel: 'añadir Google', purpose: 'sensitive' as const, force: true };

describe('profile action identity confirmation', () => {
  it('continues only after the requested confirmation succeeds', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const showMessage = vi.fn();
    expect(await confirmProfileIdentity(confirm, confirmation, showMessage)).toBe(true);
    expect(confirm).toHaveBeenCalledWith(confirmation);
    expect(showMessage).not.toHaveBeenCalled();
  });

  it.each(['identity_confirmation_busy', 'identity_confirmation_unavailable', 'auth_required'])(
    'shows the reason for %s and prevents the account action from proceeding',
    async (code) => {
      const failure = Object.assign(new Error('La autorización no está disponible. Reintenta.'), {
        code,
      });
      const showMessage = vi.fn();
      expect(
        await confirmProfileIdentity(vi.fn().mockRejectedValue(failure), confirmation, showMessage),
      ).toBe(false);
      expect(showMessage).toHaveBeenCalledExactlyOnceWith(failure.message);
    },
  );

  it.each([false, new IdentityConfirmationCancelledError()])(
    'preserves deliberate cancellation without showing an error: %j',
    async (result) => {
      const confirm =
        result instanceof Error
          ? vi.fn().mockRejectedValue(result)
          : vi.fn().mockResolvedValue(result);
      const showMessage = vi.fn();
      expect(await confirmProfileIdentity(confirm, confirmation, showMessage)).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    },
  );
});
