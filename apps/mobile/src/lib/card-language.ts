import type { StatusChipProps } from '@/components/status-chip';

export type CardStateIntent =
  | 'needsAction'
  | 'waiting'
  | 'ready'
  | 'completed'
  | 'negative'
  | 'stale'
  | 'expired'
  | 'neutral';

export type CardHaloIntensity = 'strong' | 'soft' | 'none';
export type CardStatusTone = NonNullable<StatusChipProps['tone']>;

const CARD_LANGUAGE_COLORS = {
  cycle: '#2563eb',
  cycleSoft: '#eaf1ff',
  danger: '#e8604a',
  dangerSoft: '#fceae7',
  neutral: '#667085',
  neutralSoft: '#edf5f0',
  pending: '#facc15',
  pendingSoft: '#fef3c7',
  primary: '#1a2744',
  primarySoft: '#e9edf5',
  success: '#3dba6e',
  successSoft: '#e8f8ef',
  warning: '#f97316',
  warningSoft: '#ffedd5',
} as const;

export const moneyStatusCopy = {
  amended: 'Monto modificado',
  canceled: 'Cancelado',
  completed: 'Completado',
  expired: 'Expirado',
  rejected: 'Rechazado',
  requiresYou: 'Por responder',
  waitingOtherSide: 'Esperando respuesta',
} as const;

export const circleStatusCopy = {
  approved: 'Listo para completar',
  completed: 'Completado',
  expired: 'Expirado',
  rejected: 'No completado',
  requiresYou: 'Por aprobar',
  stale: 'Reemplazado',
  waitingOthers: 'Esperando aprobaciones',
} as const;

export const inviteStatusCopy = {
  accepted: 'Aceptada',
  canceled: 'Cancelada',
  expired: 'Expirada',
  pendingActivation: 'Pendiente de activar',
  pendingClaim: 'Pendiente de abrir',
  rejected: 'Rechazada',
  requiresResponse: 'Por responder',
  requiresReview: 'Por verificar',
  waitingOtherSide: 'Esperando respuesta',
  waitingSenderReview: 'Esperando validación',
} as const;

export function cardStateTone(intent: CardStateIntent): CardStatusTone {
  if (intent === 'needsAction' || intent === 'waiting') {
    return 'warning';
  }

  if (intent === 'ready') {
    return 'cycle';
  }

  if (intent === 'completed') {
    return 'success';
  }

  if (intent === 'negative') {
    return 'danger';
  }

  return 'neutral';
}

export function cardStateColor(intent: CardStateIntent, tone: CardStatusTone = cardStateTone(intent)) {
  if (tone === 'cycle' || intent === 'ready') {
    return CARD_LANGUAGE_COLORS.cycle;
  }

  if (tone === 'primary') {
    return CARD_LANGUAGE_COLORS.primary;
  }

  if (tone === 'success') {
    return CARD_LANGUAGE_COLORS.success;
  }

  if (tone === 'warning') {
    return CARD_LANGUAGE_COLORS.pending;
  }

  if (tone === 'danger') {
    return CARD_LANGUAGE_COLORS.danger;
  }

  if (intent === 'needsAction' || intent === 'waiting') {
    return CARD_LANGUAGE_COLORS.pending;
  }

  return CARD_LANGUAGE_COLORS.neutral;
}

export function cardStateSoftColor(
  intent: CardStateIntent,
  tone: CardStatusTone = cardStateTone(intent),
) {
  if (tone === 'cycle' || intent === 'ready') {
    return CARD_LANGUAGE_COLORS.cycleSoft;
  }

  if (tone === 'primary') {
    return CARD_LANGUAGE_COLORS.primarySoft;
  }

  if (tone === 'success') {
    return CARD_LANGUAGE_COLORS.successSoft;
  }

  if (tone === 'warning') {
    return CARD_LANGUAGE_COLORS.pendingSoft;
  }

  if (tone === 'danger') {
    return CARD_LANGUAGE_COLORS.dangerSoft;
  }

  if (intent === 'needsAction' || intent === 'waiting') {
    return CARD_LANGUAGE_COLORS.pendingSoft;
  }

  return CARD_LANGUAGE_COLORS.neutralSoft;
}

export function cardStateIntentFromStatus(
  status: string,
  options: { readonly circle?: boolean } = {},
): CardStateIntent {
  if (
    status === 'requires_you' ||
    status === 'requires_you_response' ||
    status === 'requires_you_review' ||
    (options.circle && status === 'pending_approvals')
  ) {
    return 'needsAction';
  }

  if (
    status === 'waiting_other_side' ||
    status === 'waiting_sender_review' ||
    status === 'pending_claim' ||
    status === 'pending_activation' ||
    status === 'pending' ||
    status === 'amended' ||
    status === 'pending_approvals'
  ) {
    return 'waiting';
  }

  if (status === 'approved') {
    return 'ready';
  }

  if (status === 'accepted' || status === 'posted' || status === 'executed') {
    return 'completed';
  }

  if (status === 'rejected' || status === 'canceled') {
    return 'negative';
  }

  if (status === 'stale') {
    return 'stale';
  }

  if (status === 'expired') {
    return 'expired';
  }

  return 'neutral';
}

export function cardStateIntentFromTone(tone: CardStatusTone): CardStateIntent {
  if (tone === 'warning') {
    return 'needsAction';
  }

  if (tone === 'cycle' || tone === 'primary') {
    return 'ready';
  }

  if (tone === 'success') {
    return 'completed';
  }

  if (tone === 'danger') {
    return 'negative';
  }

  return 'neutral';
}
