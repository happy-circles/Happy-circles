import type { StatusChipProps } from '@/components/status-chip';
import { circleStatusCopy } from '@/lib/card-language';

export type HappyCircleParticipantDecision = 'approved' | 'pending' | 'rejected';
export type HappyCircleStatusKey =
  | 'pending_own'
  | 'waiting_others'
  | 'approved'
  | 'executed'
  | 'rejected'
  | 'stale'
  | 'expired'
  | 'unknown';

export interface HappyCirclePresentation {
  readonly actionability: 'can_decide' | 'waiting' | 'ready' | 'closed';
  readonly key: HappyCircleStatusKey;
  readonly label: string;
  readonly summary: string;
  readonly tone: StatusChipProps['tone'];
}

export function resolveHappyCirclePresentation({
  approvalsPending = 0,
  myDecision,
  status,
}: {
  readonly approvalsPending?: number;
  readonly myDecision?: HappyCircleParticipantDecision | null;
  readonly status: string;
}): HappyCirclePresentation {
  if (status === 'pending_approvals') {
    if (myDecision === 'pending') {
      return {
        actionability: 'can_decide',
        key: 'pending_own',
        label: circleStatusCopy.requiresYou,
        summary: 'Revisa el cierre antes de aprobar o rechazar.',
        tone: 'warning',
      };
    }

    return {
      actionability: 'waiting',
      key: 'waiting_others',
      label: circleStatusCopy.waitingOthers,
      summary:
        approvalsPending > 0
          ? `Faltan ${approvalsPending} aprobación${approvalsPending === 1 ? '' : 'es'} para completarlo automáticamente.`
          : 'Ya no faltan respuestas. Estamos completando el Circle.',
      tone: 'cycle',
    };
  }

  if (status === 'approved') {
    return {
      actionability: 'ready',
      key: 'approved',
      label: circleStatusCopy.approved,
      summary: 'Todos aprobaron este Happy Circle. Estamos verificando el cierre automático.',
      tone: 'success',
    };
  }

  if (status === 'executed') {
    return {
      actionability: 'closed',
      key: 'executed',
      label: circleStatusCopy.completed,
      summary: 'Happy Circle completado.',
      tone: 'success',
    };
  }

  if (status === 'rejected') {
    return {
      actionability: 'closed',
      key: 'rejected',
      label: circleStatusCopy.rejected,
      summary: 'Este Circle no se completó.',
      tone: 'danger',
    };
  }

  if (status === 'stale') {
    return {
      actionability: 'closed',
      key: 'stale',
      label: circleStatusCopy.stale,
      summary: 'Esta versión fue reemplazada porque los saldos cambiaron.',
      tone: 'cycle',
    };
  }

  if (status === 'expired') {
    return {
      actionability: 'closed',
      key: 'expired',
      label: circleStatusCopy.expired,
      summary: 'Este Circle expiró antes de completarse.',
      tone: 'danger',
    };
  }

  return {
    actionability: 'closed',
    key: 'unknown',
    label: status,
    summary: 'Estado del Happy Circle.',
    tone: 'neutral',
  };
}
