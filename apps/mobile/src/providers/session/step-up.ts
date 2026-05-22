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
    return 'Este teléfono aún no es confiable. Confíalo primero desde Perfil.';
  }

  if (error === 'not_available' || error === 'not_enrolled' || error === 'passcode_not_set') {
    return `Este dispositivo no puede usar ${biometricLabel} para ${actionLabel}.`;
  }

  if (error === 'lockout') {
    return `${biometricLabel} está bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`;
  }

  if (error === 'user_cancel') {
    return `Cancelaste ${biometricLabel}.`;
  }

  if (error === 'authentication_failed') {
    return `No se pudo validar ${biometricLabel} para ${actionLabel}.`;
  }

  if (error === 'password_required') {
    return `Escribe tu contraseña actual para ${actionLabel}.`;
  }

  if (error === 'password_unavailable') {
    return `Esta cuenta no tiene una contraseña disponible para ${actionLabel}.`;
  }

  if (error === 'password_failed') {
    return `No se pudo validar tu contraseña para ${actionLabel}.`;
  }

  if (error === 'account_mismatch') {
    return 'La validación abrió otra cuenta. Cerramos la sesión por seguridad.';
  }

  return `No se pudo validar tu identidad para ${actionLabel}.`;
}
