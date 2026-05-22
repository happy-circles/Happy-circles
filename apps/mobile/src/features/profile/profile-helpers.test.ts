import { describe, expect, it } from 'vitest';

import {
  formatContactsPermissionStateLabel,
  formatContactsPermissionSubtitle,
  formatDeviceStateLabel,
  formatDeviceTitle,
  formatStepUpFailure,
  resolveContactsPermissionActionLabel,
  resolveContactsPermissionTone,
  resolveProfileFocusRequest,
} from './profile-helpers';

describe('profile helpers', () => {
  it('formats device and contacts permission rows', () => {
    expect(formatDeviceTitle('device-1', 'device-1', 'ios')).toBe('iPhone actual');
    expect(formatDeviceTitle('device-2', 'device-1', 'android')).toBe('Android');
    expect(formatDeviceStateLabel('trusted')).toBe('Confiable');
    expect(formatContactsPermissionStateLabel('limited')).toBe('Limitado');
    expect(formatContactsPermissionSubtitle('denied')).toBe('Activalos desde Ajustes');
    expect(resolveContactsPermissionTone('denied')).toBe('danger');
    expect(resolveContactsPermissionActionLabel('limited')).toBe('Ampliar');
  });

  it('keeps step-up failure copy stable', () => {
    expect(formatStepUpFailure('device_untrusted', 'Face ID')).toBe(
      'Confía este teléfono antes de eliminar tu cuenta.',
    );
    expect(formatStepUpFailure('lockout', 'Face ID')).toBe(
      'Face ID está bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.',
    );
    expect(formatStepUpFailure(null, 'Face ID')).toBe(
      'No se pudo validar tu identidad para eliminar la cuenta.',
    );
  });

  it('derives profile focus targets from route params and account state', () => {
    expect(
      resolveProfileFocusRequest({
        canTrustCurrentDeviceWithoutPassword: false,
        focusTarget: 'attach-password',
        hasEmailPassword: false,
        isTrustedDevice: false,
        sectionTarget: null,
      }),
    ).toEqual({ highlightTarget: 'methods', inputTarget: 'attach-password' });
    expect(
      resolveProfileFocusRequest({
        canTrustCurrentDeviceWithoutPassword: false,
        focusTarget: 'attach-password',
        hasEmailPassword: true,
        isTrustedDevice: false,
        sectionTarget: null,
      }),
    ).toEqual({ highlightTarget: 'methods', inputTarget: null });
    expect(
      resolveProfileFocusRequest({
        canTrustCurrentDeviceWithoutPassword: true,
        focusTarget: 'trust-password',
        hasEmailPassword: true,
        isTrustedDevice: false,
        sectionTarget: null,
      }),
    ).toEqual({ highlightTarget: 'device', inputTarget: null });
    expect(
      resolveProfileFocusRequest({
        canTrustCurrentDeviceWithoutPassword: false,
        focusTarget: null,
        hasEmailPassword: true,
        isTrustedDevice: false,
        sectionTarget: 'contacts',
      }),
    ).toEqual({ highlightTarget: 'account', inputTarget: null });
  });
});
