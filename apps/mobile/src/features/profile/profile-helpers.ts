export type RowTone = 'danger' | 'muted' | 'primary' | 'success';
export type ProfileHighlightTarget = 'account' | 'methods' | 'device';
export type ProfileFocusInputTarget =
  | 'attach-password'
  | 'trust-password'
  | 'trust-device'
  | 'device-help'
  | 'notifications'
  | 'contacts'
  | 'methods';

export type ProfileFocusRequest = {
  readonly highlightTarget: ProfileHighlightTarget;
  readonly inputTarget: 'attach-password' | 'trust-password' | null;
};

export function formatDeviceTitle(
  deviceId: string,
  currentDeviceId: string | null,
  platform: string,
): string {
  const base = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'Web';
  return deviceId === currentDeviceId ? `${base} actual` : base;
}

export function formatDeviceStateLabel(trustState: string): string {
  if (trustState === 'trusted') {
    return 'Confiable';
  }

  if (trustState === 'revoked') {
    return 'Revocado';
  }

  return 'Pendiente';
}

export function formatContactsPermissionStateLabel(status: string): string {
  if (status === 'granted') {
    return 'Listo';
  }

  if (status === 'limited') {
    return 'Limitado';
  }

  if (status === 'denied') {
    return 'Bloqueado';
  }

  if (status === 'unavailable') {
    return 'No disponible';
  }

  if (status === 'loading') {
    return 'Revisando';
  }

  return 'Pendiente';
}

export function formatContactsPermissionSubtitle(status: string): string {
  if (status === 'granted') {
    return 'Agenda disponible para encontrar personas';
  }

  if (status === 'limited') {
    return 'Solo algunos contactos disponibles';
  }

  if (status === 'denied') {
    return 'Activalos desde Ajustes';
  }

  if (status === 'unavailable') {
    return 'No disponible en este entorno';
  }

  if (status === 'loading') {
    return 'Revisando permiso del sistema';
  }

  return 'Permite contactos para conectar desde tu agenda';
}

export function resolveContactsPermissionTone(status: string): RowTone {
  if (status === 'granted') {
    return 'success';
  }

  if (status === 'limited') {
    return 'primary';
  }

  if (status === 'denied') {
    return 'danger';
  }

  return 'muted';
}

export function resolveContactsPermissionActionLabel(status: string): string | null {
  if (status === 'undetermined') {
    return 'Permitir';
  }

  if (status === 'limited') {
    return 'Ampliar';
  }

  if (status === 'denied') {
    return 'Ajustes';
  }

  return null;
}

export function formatStepUpFailure(error: string | null, biometricLabel: string): string {
  if (error === 'device_untrusted') {
    return 'Valida este dispositivo antes de eliminar tu cuenta.';
  }

  if (error === 'not_available' || error === 'not_enrolled' || error === 'passcode_not_set') {
    return `Este dispositivo no puede usar ${biometricLabel} para eliminar la cuenta.`;
  }

  if (error === 'lockout') {
    return `${biometricLabel} está bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`;
  }

  if (error === 'user_cancel') {
    return `Cancelaste ${biometricLabel}.`;
  }

  if (error === 'authentication_failed') {
    return `No se pudo validar ${biometricLabel} para eliminar la cuenta.`;
  }

  return 'No se pudo validar tu identidad para eliminar la cuenta.';
}

export function resolveProfileFocusRequest(input: {
  readonly canTrustCurrentDeviceWithoutPassword: boolean;
  readonly focusTarget: string | null;
  readonly hasEmailPassword: boolean;
  readonly isTrustedDevice: boolean;
  readonly sectionTarget: string | null;
}): ProfileFocusRequest | null {
  const resolvedFocusTarget =
    input.focusTarget === 'trust-password' &&
    (!input.hasEmailPassword || input.isTrustedDevice || input.canTrustCurrentDeviceWithoutPassword)
      ? 'device-help'
      : input.focusTarget === 'attach-password' && input.hasEmailPassword
        ? 'methods'
        : input.focusTarget;

  if (resolvedFocusTarget === 'attach-password') {
    return { highlightTarget: 'methods', inputTarget: 'attach-password' };
  }

  if (resolvedFocusTarget === 'trust-password') {
    return { highlightTarget: 'device', inputTarget: 'trust-password' };
  }

  if (
    resolvedFocusTarget === 'trust-device' ||
    resolvedFocusTarget === 'device-help' ||
    input.sectionTarget === 'device'
  ) {
    return { highlightTarget: 'device', inputTarget: null };
  }

  if (
    resolvedFocusTarget === 'notifications' ||
    resolvedFocusTarget === 'contacts' ||
    input.sectionTarget === 'notifications' ||
    input.sectionTarget === 'contacts' ||
    input.sectionTarget === 'account'
  ) {
    return { highlightTarget: 'account', inputTarget: null };
  }

  if (resolvedFocusTarget === 'methods' || input.sectionTarget === 'methods') {
    return { highlightTarget: 'methods', inputTarget: null };
  }

  return null;
}
