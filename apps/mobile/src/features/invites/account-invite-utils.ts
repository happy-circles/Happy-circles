export const MIN_ACCOUNT_INVITE_TOKEN_LENGTH = 12;
export const MAX_ACCOUNT_INVITE_TOKEN_LENGTH = 256;
const MAX_ACCOUNT_INVITE_INPUT_LENGTH = 4096;
export const ACCOUNT_INVITE_USED_MESSAGE =
  'Esta invitación ya fue utilizada. Pídele a quien te invitó que genere una nueva desde la app.';
export const ACCOUNT_INVITE_UNAVAILABLE_MESSAGE =
  'Esta invitación ya fue utilizada o no está disponible. Pídele a quien te invitó que genere una nueva desde la app.';

export function inviteReasonLabel(reason: string): string {
  if (reason === 'invite_unavailable') {
    return ACCOUNT_INVITE_UNAVAILABLE_MESSAGE;
  }

  if (reason === 'delivery_revoked') {
    return 'Este enlace ya fue utilizado o reemplazado. Pídele a quien te invitó que genere una nueva desde la app.';
  }

  if (reason === 'delivery_expired' || reason === 'expired') {
    return 'Esta invitación ya venció.';
  }

  if (reason === 'pending_inviter_review') {
    return 'Tu cuenta ya quedó activa. Solo falta que la persona que te invitó confirme el contacto.';
  }

  if (reason === 'accepted') {
    return ACCOUNT_INVITE_USED_MESSAGE;
  }

  if (reason === 'rejected') {
    return 'La invitación fue cerrada después de revisar el contacto.';
  }

  if (reason === 'canceled') {
    return 'La invitación fue cancelada.';
  }

  return 'Necesitas terminar la activacion para entrar a Happy Circles.';
}

export function extractAccountInviteToken(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.length > MAX_ACCOUNT_INVITE_INPUT_LENGTH) {
    return '';
  }

  const normalizeToken = (candidate: string): string => {
    try {
      const decoded = decodeURIComponent(candidate).trim();
      return decoded.length <= MAX_ACCOUNT_INVITE_TOKEN_LENGTH ? decoded : '';
    } catch {
      return '';
    }
  };

  try {
    const url = new URL(trimmed);
    const tokenParam = url.searchParams.get('token') ?? url.searchParams.get('invite');
    if (tokenParam?.trim()) {
      return normalizeToken(tokenParam);
    }

    const pathParts = [url.host, ...url.pathname.split('/')].filter(Boolean);
    const joinIndex = pathParts.findIndex((part) => part.toLocaleLowerCase('en-US') === 'join');
    if (joinIndex >= 0 && pathParts[joinIndex + 1]) {
      return normalizeToken(pathParts[joinIndex + 1]);
    }
  } catch {
    // Not a URL. Fall through and treat it as a raw token or copied path.
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  const pathParts = withoutQuery.split('/').filter(Boolean);
  const joinIndex = pathParts.findIndex((part) => part.toLocaleLowerCase('en-US') === 'join');
  if (joinIndex >= 0 && pathParts[joinIndex + 1]) {
    return normalizeToken(pathParts[joinIndex + 1]);
  }

  return normalizeToken(trimmed);
}

export function accountInviteStatusMessage(status: string, deliveryStatus: string): string | null {
  if (deliveryStatus === 'unavailable' || status === 'unavailable') {
    return ACCOUNT_INVITE_UNAVAILABLE_MESSAGE;
  }

  if (deliveryStatus === 'revoked') {
    return 'Este enlace ya fue utilizado o reemplazado. Pídele a quien te invitó que genere una nueva desde la app.';
  }

  if (deliveryStatus === 'expired' || status === 'expired') {
    return 'Esta invitación ya venció. Pide una nueva para empezar.';
  }

  if (deliveryStatus === 'activated' || status === 'accepted') {
    return ACCOUNT_INVITE_USED_MESSAGE;
  }

  if (status === 'rejected' || status === 'canceled') {
    return 'Esta invitación ya fue cerrada.';
  }

  if (status === 'pending_inviter_review') {
    return 'Esta invitación ya fue utilizada y está esperando revisión. Si no fuiste tú, pídele a quien te invitó que genere una nueva desde la app.';
  }

  return null;
}
