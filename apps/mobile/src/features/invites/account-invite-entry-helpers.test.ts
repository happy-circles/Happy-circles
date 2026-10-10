import { describe, expect, it } from 'vitest';

import { accountInviteStatusMessage, extractAccountInviteToken } from './account-invite-utils';
import {
  biometricMessage,
  isRecoveryCodeValid,
  resolveAccountInviteEntryParams,
  resolveAuthLogoCopy,
  resolveSecondaryAuthAction,
  resolveSignInCompletionAction,
  resolveTokenFieldError,
  resolveTokenLogoSubtitle,
  validateEmailForAuth,
  validatePasswordForAuth,
} from './account-invite-entry-helpers';

describe('account invite entry helpers', () => {
  const completionInput = {
    status: 'signed_in_unlocked' as const,
    accountAccessState: 'active' as const,
    profileCompletionState: 'complete' as const,
    setupState: { requiredComplete: true, pendingRequiredSteps: [], securityPending: false },
    pendingToken: null,
  };

  it.each(['needs_invite', 'needs_activation'] as const)(
    'returns %s accounts without a token to usable invitation entry',
    (accountAccessState) => {
      expect(resolveSignInCompletionAction({ ...completionInput, accountAccessState })).toEqual({
        action: 'invite_entry',
      });
    },
  );

  it('keeps required setup before account gating and pending invitations before Home', () => {
    expect(
      resolveSignInCompletionAction({
        ...completionInput,
        accountAccessState: 'needs_invite',
        setupState: {
          requiredComplete: false,
          pendingRequiredSteps: ['profile'],
          securityPending: false,
        },
        pendingToken: 'invite-token-123456',
      }),
    ).toEqual({
      action: 'navigate',
      destination: { pathname: '/setup-account', params: { step: 'profile' } },
    });
    expect(
      resolveSignInCompletionAction({ ...completionInput, pendingToken: 'invite-token-123456' }),
    ).toEqual({
      action: 'navigate',
      destination: { pathname: '/join/[token]', params: { token: 'invite-token-123456' } },
    });
    expect(resolveSignInCompletionAction(completionInput)).toEqual({
      action: 'navigate',
      destination: '/home',
    });
  });

  it('waits for session and account loading or a locked session before completing login', () => {
    for (const state of [
      { status: 'loading' as const },
      { status: 'signed_out' as const },
      { status: 'signed_in_locked' as const },
      { accountAccessState: 'loading' as const },
      { profileCompletionState: 'loading' as const },
    ]) {
      expect(resolveSignInCompletionAction({ ...completionInput, ...state })).toEqual({
        action: 'wait',
      });
    }
  });
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
