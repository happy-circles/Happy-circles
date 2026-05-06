interface SensitiveStepUpResult {
  readonly success: boolean;
  readonly error?:
    | 'authentication_failed'
    | 'lockout'
    | 'not_available'
    | 'not_enrolled'
    | 'passcode_not_set'
    | 'user_cancel'
    | string
    | null;
}

export interface SensitiveMutationSession {
  readonly biometricLabel: string;
  readonly deviceTrustState: string;
  readonly isEmailConfirmed: boolean;
  readonly profileCompletionState: string;
  stepUpAuth(): Promise<SensitiveStepUpResult>;
}

export async function guardSensitiveMutationAction(
  session: SensitiveMutationSession,
  actionLabel: string,
): Promise<void> {
  if (!session.isEmailConfirmed) {
    throw new Error('Confirma tu correo antes de mover dinero o aprobar cambios sensibles.');
  }

  if (session.profileCompletionState !== 'complete') {
    throw new Error('Completa tu perfil antes de mover dinero o aprobar cambios sensibles.');
  }

  if (session.deviceTrustState !== 'trusted') {
    throw new Error('Este dispositivo aun no es confiable. Validalo primero desde seguridad.');
  }

  const result = await session.stepUpAuth();
  if (!result.success) {
    if (
      result.error === 'not_available' ||
      result.error === 'not_enrolled' ||
      result.error === 'passcode_not_set'
    ) {
      throw new Error(`Este dispositivo no puede usar ${session.biometricLabel} para ${actionLabel}.`);
    }

    if (result.error === 'lockout') {
      throw new Error(
        `${session.biometricLabel} esta bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`,
      );
    }

    if (result.error === 'user_cancel') {
      throw new Error(`Cancelaste ${session.biometricLabel}.`);
    }

    if (result.error === 'authentication_failed') {
      throw new Error(`No se pudo validar ${session.biometricLabel} para ${actionLabel}.`);
    }

    throw new Error(`No se pudo validar tu identidad para ${actionLabel}.`);
  }
}
