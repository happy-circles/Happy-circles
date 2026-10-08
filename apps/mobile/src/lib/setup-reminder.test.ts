import { describe, expect, it, vi } from 'vitest';

vi.mock('./storage', () => ({ getStoredItem: vi.fn(), setStoredItem: vi.fn() }));

import { buildPendingSetupReminderItems } from './setup-reminder';

describe('contextual device authorization reminders', () => {
  it('does not create a separate mandatory trust task before an action needs authorization', () => {
    const items = buildPendingSetupReminderItems({
      accountAccessState: 'active',
      profileCompletionState: 'complete',
      isTrustedDevice: false,
      appleSignInAvailable: false,
      biometricAvailable: false,
      biometricsEnabled: false,
      linkedMethods: { hasApple: false, hasEmailPassword: true, hasGoogle: true },
      notificationsEnabled: true,
      setupState: { contactsPermissionStatus: 'granted' },
    });
    expect(items).toEqual([]);
  });
});
