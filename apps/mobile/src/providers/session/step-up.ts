export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function formatStepUpErrorMessage(
  actionLabel: string,
  biometricLabel: string,
  error: string | null,
): string {
  if (error === 'device_untrusted') {
    return 'Este dispositivo aun no es confiable. Validalo primero desde Perfil.';
  }

  if (error === 'not_available' || error === 'not_enrolled' || error === 'passcode_not_set') {
    return `Este dispositivo no puede usar ${biometricLabel} para ${actionLabel}.`;
  }

  if (error === 'lockout') {
    return `${biometricLabel} esta bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`;
  }

  if (error === 'user_cancel') {
    return `Cancelaste ${biometricLabel}.`;
  }

  if (error === 'authentication_failed') {
    return `No se pudo validar ${biometricLabel} para ${actionLabel}.`;
  }

  return `No se pudo validar tu identidad para ${actionLabel}.`;
}
