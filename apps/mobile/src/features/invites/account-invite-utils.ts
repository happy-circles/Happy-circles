export const MIN_ACCOUNT_INVITE_TOKEN_LENGTH = 12;

export function extractAccountInviteToken(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const tokenParam = url.searchParams.get('token') ?? url.searchParams.get('invite');
    if (tokenParam?.trim()) {
      return tokenParam.trim();
    }

    const pathParts = [url.host, ...url.pathname.split('/')].filter(Boolean);
    const joinIndex = pathParts.findIndex((part) => part.toLocaleLowerCase('en-US') === 'join');
    if (joinIndex >= 0 && pathParts[joinIndex + 1]) {
      return decodeURIComponent(pathParts[joinIndex + 1]);
    }
  } catch {
    // Not a URL. Fall through and treat it as a raw token or copied path.
  }

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  const pathParts = withoutQuery.split('/').filter(Boolean);
  const joinIndex = pathParts.findIndex((part) => part.toLocaleLowerCase('en-US') === 'join');
  if (joinIndex >= 0 && pathParts[joinIndex + 1]) {
    return decodeURIComponent(pathParts[joinIndex + 1]);
  }

  return trimmed;
}

export function accountInviteStatusMessage(
  status: string,
  deliveryStatus: string,
): string | null {
  if (deliveryStatus === 'revoked') {
    return 'Este link fue reemplazado por una invitacion mas reciente.';
  }

  if (deliveryStatus === 'expired' || status === 'expired') {
    return 'Esta invitacion ya vencio. Pide una nueva para empezar.';
  }

  if (status === 'accepted') {
    return 'Esta invitacion ya fue usada.';
  }

  if (status === 'rejected' || status === 'canceled') {
    return 'Esta invitacion ya fue cerrada.';
  }

  if (status === 'pending_inviter_review') {
    return 'Esta invitacion ya fue reclamada y esta esperando revision.';
  }

  return null;
}
