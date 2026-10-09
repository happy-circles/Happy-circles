import type { SensitiveMutationSession } from '@/lib/live-data/mutations/sensitive-action-check';

export interface RegisterAccessIssue {
  readonly kind: 'email' | 'profile' | 'authorize' | 'unlock' | 'retry' | 'session';
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
}

export function registerAccessErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

const RECOVERABLE_ACCESS_CODES = new Set([
  'auth_required',
  'session_changed',
  'email_confirmation_required',
  'profile_incomplete',
  'identity_confirmation_unavailable',
  'identity_confirmation_busy',
  'device_authorization_required',
  'trusted_origin_required',
  'recent_auth_required',
]);

export function isRegisterAccessFailure(error: unknown): boolean {
  const code = registerAccessErrorCode(error);
  return code !== null && RECOVERABLE_ACCESS_CODES.has(code);
}

export function registerRetryConfirmation(error: unknown): 'device' | 'sensitive' | undefined {
  const code = registerAccessErrorCode(error);
  if (code === 'recent_auth_required') return 'sensitive';
  if (
    code === 'device_authorization_required' ||
    code === 'trusted_origin_required' ||
    code === 'identity_confirmation_unavailable' ||
    code === 'identity_confirmation_busy'
  )
    return 'device';
  return undefined;
}

export function resolveRegisterAccessIssue(
  session: SensitiveMutationSession,
  error: unknown = null,
  isCorrection = false,
): RegisterAccessIssue | null {
  const code = registerAccessErrorCode(error);
  const submitLabel = isCorrection ? 'enviar' : 'registrar';
  if (!session.userId || code === 'auth_required' || code === 'session_changed') {
    return {
      kind: 'session',
      title: 'Revisa tu sesión',
      message: 'Inicia sesión con tu cuenta para continuar.',
      actionLabel: 'Iniciar sesión',
    };
  }
  if (!session.isEmailConfirmed || code === 'email_confirmation_required') {
    return {
      kind: 'email',
      title: 'Falta confirmar tu correo',
      message: 'Confirma tu correo para continuar. Tu borrador se mantiene aquí.',
      actionLabel: 'Confirmar correo',
    };
  }
  if (session.profileCompletionState !== 'complete' || code === 'profile_incomplete') {
    return {
      kind: 'profile',
      title: 'Falta completar tu perfil',
      message: 'Completa tu nombre y celular para continuar. Tu borrador se mantiene aquí.',
      actionLabel: 'Completar perfil',
    };
  }
  if (code === 'identity_confirmation_unavailable' || code === 'identity_confirmation_busy') {
    return {
      kind: 'retry',
      title: 'No pudimos abrir la confirmación',
      message:
        code === 'identity_confirmation_busy'
          ? 'Hay otra confirmación en curso. Espera a que termine y vuelve a intentar.'
          : 'Inténtalo de nuevo. El movimiento aún no se ha enviado y tu borrador sigue aquí.',
      actionLabel: 'Reintentar confirmación',
    };
  }
  if (
    !session.isAuthorizedDeviceSession ||
    code === 'device_authorization_required' ||
    code === 'trusted_origin_required'
  ) {
    return {
      kind: 'authorize',
      title: 'Falta autorizar esta sesión',
      message: 'Confirma tu identidad para continuar. Tu borrador se mantiene aquí.',
      actionLabel: `Autorizar y ${submitLabel}`,
    };
  }
  if (session.isLocked || code === 'recent_auth_required') {
    return {
      kind: 'unlock',
      title: 'Falta confirmar tu identidad',
      message: 'Confirma con un método de tu cuenta para continuar. Tu borrador se mantiene aquí.',
      actionLabel: `Confirmar y ${submitLabel}`,
    };
  }
  return null;
}
