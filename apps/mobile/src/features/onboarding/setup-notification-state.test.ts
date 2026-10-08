import { describe, expect, it } from 'vitest';

import { resolveSetupNotificationState } from './setup-notification-state';

describe('onboarding notification activation', () => {
  it('offers activation after Settings grants permission while reminders remain off', () => {
    const state = resolveSetupNotificationState('granted', false);

    expect(state.actionLabel).toBe('Activar');
    expect(state.statusLabel).toBe('Pendiente');
    expect(state.tone).toBe('muted');
    expect(state.subtitle).not.toContain('activados');
  });

  it('shows completion only when permission and the reminder preference are enabled', () => {
    expect(resolveSetupNotificationState('granted', true)).toMatchObject({
      actionLabel: null,
      statusLabel: 'Listo',
      tone: 'success',
    });
    expect(resolveSetupNotificationState('denied', true)).toMatchObject({
      actionLabel: 'Ajustes',
      statusLabel: 'Bloqueado',
    });
  });

  it('keeps unsupported environments without an activation action', () => {
    expect(resolveSetupNotificationState('unavailable', false)).toMatchObject({
      actionLabel: null,
      statusLabel: 'No disponible',
    });
  });
});
