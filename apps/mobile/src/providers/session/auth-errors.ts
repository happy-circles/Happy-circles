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
      return 'No se pudo guardar la sesion local. Cierra y abre Expo, actualiza esta version e inicia sesion otra vez.';
    }

    return error.message;
  }

  return 'No se pudo completar la accion.';
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

  return 'No se pudo completar la accion.';
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
    return 'Supabase bloqueo temporalmente el envio de correos por exceso de intentos. Espera antes de volver a probar o revisa los limites de Auth y tu proveedor SMTP.';
  }

  if (
    normalized.includes('error sending recovery email') ||
    normalized.includes('error sending confirmation email')
  ) {
    return 'Supabase no pudo enviar el correo. Revisa en Supabase que Email use el SMTP de Resend, que el remitente pertenezca a un dominio verificado y que las URLs permitidas incluyan https://app.happy-circles.com/reset-password y https://app.happy-circles.com/setup-account.';
  }

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Correo o clave incorrectos.';
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
    return 'Codigo invalido o vencido. Revisa el correo mas reciente o pide uno nuevo.';
  }

  if (normalized.includes('invalid') && normalized.includes('email')) {
    return 'Correo invalido.';
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
    return 'Clave no valida. Usa 8 a 72 caracteres.';
  }

  if (
    normalized.includes('duplicate key value violates unique constraint') &&
    normalized.includes('user_profiles_phone_e164_unique_idx')
  ) {
    return 'Ese celular ya esta vinculado.';
  }

  if (normalized.includes('database error saving new user')) {
    return 'No pudimos crear la cuenta con esta invitacion. Revisa que el link siga disponible y que el celular no este vinculado.';
  }

  return message;
}
