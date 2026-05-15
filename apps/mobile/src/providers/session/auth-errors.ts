export function formatValidationMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { readonly issues?: unknown }).issues)
  ) {
    const firstIssue = (error as { readonly issues: Array<{ readonly message?: string }> })
      .issues[0];
    return firstIssue?.message ?? 'Revisa los datos e intenta otra vez.';
  }

  if (error instanceof Error) {
    const normalized = error.message.trim().toLocaleLowerCase('en-US');

    if (
      normalized.includes('securestore') &&
      normalized.includes('invalid') &&
      normalized.includes('key')
    ) {
      return 'No se pudo guardar la sesión local. Cierra y abre la app, actualiza esta versión e inicia sesión otra vez.';
    }

    return error.message;
  }

  return 'No se pudo completar la acción.';
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { readonly message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return 'No se pudo completar la acción.';
}

export function formatSupabaseAuthErrorMessage(message: string): string {
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (
    normalized.includes('email rate limit exceeded') ||
    normalized.includes('over_email_send_rate_limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('rate limit') ||
    normalized.includes('for security purposes')
  ) {
    return 'No pudimos enviar el correo por exceso de intentos. Espera unos minutos antes de volver a probar.';
  }

  if (
    normalized.includes('error sending recovery email') ||
    normalized.includes('error sending confirmation email')
  ) {
    return 'No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.';
  }

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Correo o contraseña incorrectos.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Confirma tu correo para continuar.';
  }

  if (
    normalized.includes('invalid otp') ||
    normalized.includes('otp expired') ||
    normalized.includes('token has expired') ||
    normalized.includes('token is invalid')
  ) {
    return 'Código inválido o vencido. Revisa el correo más reciente o pide uno nuevo.';
  }

  if (normalized.includes('invalid') && normalized.includes('email')) {
    return 'Correo inválido.';
  }

  if (
    normalized.includes('user already registered') ||
    normalized.includes('user_already_exists') ||
    normalized.includes('already registered') ||
    (normalized.includes('already exists') && normalized.includes('email'))
  ) {
    return 'Ese correo ya existe.';
  }

  if (
    normalized.includes('password') &&
    (normalized.includes('weak') ||
      normalized.includes('minimum') ||
      normalized.includes('at least') ||
      normalized.includes('characters'))
  ) {
    return 'Contraseña no válida. Usa entre 8 y 72 caracteres.';
  }

  if (
    normalized.includes('duplicate key value violates unique constraint') &&
    normalized.includes('user_profiles_phone_e164_unique_idx')
  ) {
    return 'Ese celular ya está vinculado.';
  }

  if (normalized.includes('database error saving new user')) {
    return 'No pudimos crear la cuenta con esta invitación. Revisa que el enlace siga disponible y que el celular no esté vinculado.';
  }

  return message;
}
