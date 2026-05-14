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
        summary: 'Revisa antes de decidir.',
        tone: 'warning',
      };
    }

    return {
      actionability: 'waiting',
      key: 'waiting_others',
      label: circleStatusCopy.waitingOthers,
      summary:
        approvalsPending > 0
          ? `Faltan ${approvalsPending} aprobación${approvalsPending === 1 ? '' : 'es'}.`
          : 'Sin pendientes.',
      tone: 'cycle',
    };
  }

  if (status === 'approved') {
    return {
      actionability: 'ready',
      key: 'approved',
      label: circleStatusCopy.approved,
      summary: 'Aprobado. Falta cerrar.',
      tone: 'success',
    };
  }

  if (status === 'executed') {
    return {
      actionability: 'closed',
      key: 'executed',
      label: circleStatusCopy.completed,
      summary: 'Movimientos registrados.',
      tone: 'success',
    };
  }

  if (status === 'rejected') {
    return {
      actionability: 'closed',
      key: 'rejected',
      label: circleStatusCopy.rejected,
      summary: 'No se aplicaron movimientos.',
      tone: 'danger',
    };
  }

  if (status === 'stale') {
    return {
      actionability: 'closed',
      key: 'stale',
      label: circleStatusCopy.stale,
      summary: 'Hay un calculo nuevo.',
      tone: 'cycle',
    };
  }

  if (status === 'expired') {
    return {
      actionability: 'closed',
      key: 'expired',
      label: circleStatusCopy.expired,
      summary: 'Expiro sin cambios.',
      tone: 'danger',
    };
  }

  return {
    actionability: 'closed',
    key: 'unknown',
    label: status,
    summary: 'Estado del Circle.',
    tone: 'neutral',
  };
}
