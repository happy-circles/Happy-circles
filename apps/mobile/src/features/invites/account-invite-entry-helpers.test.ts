import { describe, expect, it } from 'vitest';

import { accountInviteStatusMessage, extractAccountInviteToken } from './account-invite-utils';
import {
  biometricMessage,
  isRecoveryCodeValid,
  resolveAccountInviteEntryParams,
  resolveAuthLogoCopy,
  resolveSecondaryAuthAction,
  resolveTokenFieldError,
  resolveTokenLogoSubtitle,
  validateEmailForAuth,
  validatePasswordForAuth,
} from './account-invite-entry-helpers';

describe('account invite entry helpers', () => {
  it('extracts invite tokens from links and copied paths', () => {
    expect(extractAccountInviteToken('https://happy.test/join/token-123')).toBe('token-123');
    expect(extractAccountInviteToken('happycircles://join/token-456')).toBe('token-456');
    expect(extractAccountInviteToken('/join/token-789?source=sms')).toBe('token-789');
    expect(extractAccountInviteToken(' raw-token ')).toBe('raw-token');
    expect(extractAccountInviteToken('/join/%E0%A4%A')).toBe('');
    expect(extractAccountInviteToken(`https://happy.test/join/${'x'.repeat(257)}`)).toBe('');
    expect(extractAccountInviteToken('x'.repeat(4097))).toBe('');
  });

  it('derives entry mode from route params and remembered account state', () => {
    expect(
      resolveAccountInviteEntryParams({
        hasRememberedAccount: true,
        isDev: false,
      }),
    ).toMatchObject({
      autoUseRememberedAccount: true,
      initialMode: 'sign-in',
      initialSurface: 'auth',
      isPreviewMode: false,
    });
    expect(
      resolveAccountInviteEntryParams({
        hasRememberedAccount: true,
        isDev: true,
        rawPreviewParam: 'true',
      }).initialSurface,
    ).toBe('token');
    expect(
      resolveAccountInviteEntryParams({
        hasRememberedAccount: false,
        isDev: false,
        rawModeParam: 'forgot-password',
      }),
    ).toMatchObject({
      autoUseRememberedAccount: false,
      initialMode: 'recover',
      initialSurface: 'auth',
    });
    expect(
      resolveAccountInviteEntryParams({
        hasRememberedAccount: true,
        isDev: false,
        rawModeParam: 'invite',
      }),
    ).toMatchObject({
      autoUseRememberedAccount: false,
      initialMode: 'sign-in',
      initialSurface: 'token',
    });
  });

  it('keeps recovery validation and copy centralized', () => {
    expect(isRecoveryCodeValid('12345678')).toBe(true);
    expect(isRecoveryCodeValid('1234')).toBe(false);
    expect(validateEmailForAuth('')).toBe('Escribe tu correo.');
    expect(validateEmailForAuth('samuel')).toBe('Escribe un correo válido.');
    expect(validateEmailForAuth('samuel@example.com')).toBeUndefined();
    expect(validatePasswordForAuth({ isRecovery: false, password: '' })).toBe(
      'Escribe tu contraseña.',
    );
    expect(validatePasswordForAuth({ isRecovery: true, password: '' })).toBeUndefined();
    expect(
      resolveAuthLogoCopy({
        isOtherAccountMode: false,
        isRecovery: true,
        recoveryLinkSent: true,
        showAuthOptions: true,
        showPasswordFields: false,
      }),
    ).toEqual({
      subtitle: 'Si existe la cuenta, el enlace va en camino.',
      title: 'Revisa tu correo',
    });
  });

  it('derives remembered reauth, token and secondary action messages', () => {
    expect(biometricMessage('user_cancel', 'Face ID')).toBe(
      'Cancelaste Face ID. Puedes entrar con correo y contraseña.',
    );
    expect(biometricMessage('not_available', 'Face ID')).toBe(
      'Este dispositivo no tiene biometría disponible. Entra con correo y contraseña.',
    );
    expect(
      resolveTokenFieldError({
        blockingMessage: null,
        normalizedToken: 'short',
        tokenMessage: null,
        tokenTouched: true,
      }),
    ).toBe('Pega el código completo para continuar.');
    expect(
      resolveTokenLogoSubtitle({
        blockingMessage: null,
        inviterDisplayName: 'Ana',
        isFetching: false,
      }),
    ).toBe('Pega tu código para continuar.');
    expect(accountInviteStatusMessage('unavailable', 'unavailable')).toBe(
      'Esta invitación ya fue utilizada o no está disponible. Pídele a quien te invitó que genere una nueva desde la app.',
    );
    expect(accountInviteStatusMessage('accepted', 'activated')).toBe(
      'Esta invitación ya fue utilizada. Pídele a quien te invitó que genere una nueva desde la app.',
    );
    expect(
      resolveSecondaryAuthAction({
        hasRememberedAccount: true,
        isOtherAccountMode: false,
        isRecovery: false,
      }),
    ).toEqual({
      icon: 'person-circle-outline',
      intent: 'show_other_account',
      label: 'Usar otra cuenta',
    });
  });
});
