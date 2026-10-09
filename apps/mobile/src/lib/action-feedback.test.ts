import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Alert } from 'react-native';
import {
  resolveBlockedAction,
  showBlockedActionAlert,
  type BlockedActionContext,
} from './action-feedback';

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }));
vi.mock('./identity-flow-haptics', () => ({ triggerIdentityWarningHaptic: vi.fn() }));
vi.mock('./app-haptics', () => ({
  triggerAppErrorHaptic: vi.fn(),
  triggerAppSuccessHaptic: vi.fn(),
}));

function followResolution(error: unknown, context?: BlockedActionContext) {
  const push = vi.fn();
  expect(showBlockedActionAlert(error, { push }, context)).toBe(true);
  const buttons = vi.mocked(Alert.alert).mock.calls[0][2];
  buttons?.[1].onPress?.();
  return push.mock.calls[0][0] as { pathname: string; params: Record<string, string> };
}

describe('blocked action recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns to the original action after trusting the phone', () => {
    expect(
      followResolution('Este teléfono aún no es confiable. Confíalo primero desde seguridad.'),
    ).toEqual({ pathname: '/setup-account', params: { step: 'security', returnTo: 'previous' } });
  });

  it('requests identity confirmation instead of presenting device trust as the solution', () => {
    expect(
      followResolution('No se pudo validar tu identidad para aprobar este movimiento.'),
    ).toEqual({
      pathname: '/setup-account',
      params: { step: 'security', returnTo: 'previous', reason: 'identity' },
    });
  });

  it('preserves the return destination when email confirmation blocks an action', () => {
    expect(followResolution('Confirma tu correo antes de mover dinero.').params).toEqual({
      step: 'email',
      returnTo: 'previous',
    });
  });

  it('does not send unrelated network failures into security setup', () => {
    expect(showBlockedActionAlert('Sin conexión. Intenta de nuevo.', { push: vi.fn() })).toBe(
      false,
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each([
    ['email_confirmation_required', 'email'],
    ['profile_incomplete', 'profile'],
    ['device_authorization_required', 'security'],
    ['trusted_origin_required', 'security'],
    ['device_not_trusted', 'security'],
  ])('routes a typed %s error without relying on its translated message', (code, step) => {
    const error = Object.assign(new Error('A translated server message.'), { code });
    expect(followResolution(error).params).toEqual({ step, returnTo: 'previous' });
  });

  it('requests a fresh identity confirmation for recent authentication errors', () => {
    const error = Object.assign(new Error('Vuelve a confirmar tu identidad.'), {
      code: 'recent_auth_required',
    });
    expect(followResolution(error).params).toEqual({
      step: 'security',
      returnTo: 'previous',
      reason: 'identity',
    });
  });

  it('routes an invalid session to the existing sign-in screen', () => {
    expect(
      followResolution({ code: 'auth_required', message: 'Autenticación requerida.' }),
    ).toEqual({
      pathname: '/join',
      params: { mode: 'sign-in' },
    });
  });

  it('routes a missing relationship to people instead of security', () => {
    const push = vi.fn();
    expect(showBlockedActionAlert({ code: 'active_relationship_required' }, { push })).toBe(true);
    vi.mocked(Alert.alert).mock.calls[0]?.[2]?.[1]?.onPress?.();
    expect(push).toHaveBeenCalledWith('/people');
  });

  it('uses confirmed account state when a combined identity error has several possible prerequisites', () => {
    const error = {
      code: 'identity_incomplete',
      message: 'Completa tu nombre, celular y confirma tu correo antes de enviar solicitudes.',
    };
    expect(followResolution(error, { profile: { emailConfirmed: true } }).params.step).toBe(
      'profile',
    );
    vi.clearAllMocks();
    expect(followResolution(error, { profile: { emailConfirmed: false } }).params.step).toBe(
      'email',
    );
  });

  it.each(['identity_confirmation_unavailable', 'identity_confirmation_busy'])(
    'leaves %s available for an inline recovery without opening another alert',
    (code) => {
      const error = { code, message: 'La validación no pudo abrirse.' };
      expect(resolveBlockedAction(error)?.presentation).toBe('inline');
      expect(showBlockedActionAlert(error, { push: vi.fn() })).toBe(false);
      expect(Alert.alert).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined, { code: 'network_error' }, new Error('Sin conexión')])(
    'ignores unrelated errors without throwing: %j',
    (error) => {
      expect(showBlockedActionAlert(error, { push: vi.fn() })).toBe(false);
      expect(Alert.alert).not.toHaveBeenCalled();
    },
  );
});
