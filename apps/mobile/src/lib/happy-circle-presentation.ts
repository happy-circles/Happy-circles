import type { StatusChipProps } from '@/components/status-chip';

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
        label: 'Necesita tu aprobacion',
        summary: 'Revisa el cierre antes de aprobar o rechazar.',
        tone: 'warning',
      };
    }

    return {
      actionability: 'waiting',
      key: 'waiting_others',
      label: 'Esperando aprobaciones',
      summary:
        approvalsPending > 0
          ? `Faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'} para completarlo automaticamente.`
          : 'Ya no faltan respuestas. Estamos completando el Circle.',
      tone: 'neutral',
    };
  }

  if (status === 'approved') {
    return {
      actionability: 'ready',
      key: 'approved',
      label: 'Listo para completar',
      summary: 'Todos aprobaron este Happy Circle. Estamos verificando el cierre automatico.',
      tone: 'cycle',
    };
  }

  if (status === 'executed') {
    return {
      actionability: 'closed',
      key: 'executed',
      label: 'Completado',
      summary: 'Happy Circle completado.',
      tone: 'success',
    };
  }

  if (status === 'rejected') {
    return {
      actionability: 'closed',
      key: 'rejected',
      label: 'No completado',
      summary: 'Este Circle no se completo.',
      tone: 'danger',
    };
  }

  if (status === 'stale') {
    return {
      actionability: 'closed',
      key: 'stale',
      label: 'Reemplazado',
      summary: 'Esta version fue reemplazada porque los saldos cambiaron.',
      tone: 'neutral',
    };
  }

  if (status === 'expired') {
    return {
      actionability: 'closed',
      key: 'expired',
      label: 'Expirado',
      summary: 'Este Circle expiro antes de completarse.',
      tone: 'neutral',
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
