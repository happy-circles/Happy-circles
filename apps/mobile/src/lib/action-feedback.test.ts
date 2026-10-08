import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Alert } from 'react-native';
import { showBlockedActionAlert } from './action-feedback';

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }));
vi.mock('./identity-flow-haptics', () => ({ triggerIdentityWarningHaptic: vi.fn() }));
vi.mock('./app-haptics', () => ({
  triggerAppErrorHaptic: vi.fn(),
  triggerAppSuccessHaptic: vi.fn(),
}));

function followResolution(message: string) {
  const push = vi.fn();
  expect(showBlockedActionAlert(message, { push })).toBe(true);
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
});
