import type { Href } from 'expo-router';

import type { ActivityItemDto } from '@happy-circles/application';

import type { CircleActionFeedbackAction } from '@/components/circle-action-feedback-overlay';
import type { HappyCircleRingParticipant } from '@/components/happy-circle-ring';
import type { HistoryCaseTone } from '@/components/history-case-card';
import { transactionStatusLabel } from '@/lib/transaction-presentation';
import { pendingStatusLabel, type PersonSegmentKey } from './person-detail-helpers';

export function fallbackCircleFeedbackParticipants(input: {
  readonly action: CircleActionFeedbackAction;
  readonly counterpartyLabel?: string | null;
  readonly currentUserId: string | null | undefined;
  readonly participantUserIds?: readonly string[] | null;
}): readonly HappyCircleRingParticipant[] {
  const decision: HappyCircleRingParticipant['decision'] =
    input.action === 'execute' ? 'approved' : 'pending';
  const participants =
    input.participantUserIds?.map((participantUserId, index) => ({
      decision,
      label:
        participantUserId === input.currentUserId
          ? 'Tú'
          : index === 0 && input.counterpartyLabel
            ? input.counterpartyLabel
            : 'Happy',
      userId: participantUserId,
    })) ?? [];

  if (
    input.currentUserId &&
    !participants.some((participant) => participant.userId === input.currentUserId)
  ) {
    return [{ decision, label: 'Tú', userId: input.currentUserId }, ...participants];
  }

  if (participants.length > 0) {
    return participants;
  }

  return [{ decision, label: 'Tú', userId: 'circle-feedback:self' }];
}

export function buildPersonPanelHref(input: {
  readonly focusId?: string | null;
  readonly panel: PersonSegmentKey;
  readonly userId: string;
}): Href {
  const focusParam = input.focusId ? `&focus=${encodeURIComponent(input.focusId)}` : '';

  return `/person/${encodeURIComponent(input.userId)}?panel=${input.panel}${focusParam}` as Href;
}

export function pendingCaseTone(item: ActivityItemDto): HistoryCaseTone {
  if (item.kind === 'settlement_proposal') {
    return 'cycle';
  }

  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return 'danger';
  }

  if (item.tone === 'positive') {
    return 'positive';
  }

  if (item.tone === 'negative') {
    return 'negative';
  }

  return 'neutral';
}

export function pendingCurrentStatusTone(item: ActivityItemDto): HistoryCaseTone {
  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return 'danger';
  }

  if (item.status === 'approved') {
    return 'positive';
  }

  if (item.status === 'pending_approvals' || item.status === 'requires_you') {
    return 'negative';
  }

  if (item.kind === 'settlement_proposal') {
    return 'cycle';
  }

  return pendingCaseTone(item);
}

export function pendingCurrentStatusDetail(item: ActivityItemDto): string {
  if (item.kind === 'settlement_proposal') {
    if (item.status === 'pending_approvals') {
      return 'Falta tu aprobación.';
    }

    if (item.status === 'approved') {
      return 'Aprobado. Puedes completarlo.';
    }

    if (item.status === 'waiting_other_side') {
      return 'Faltan aprobaciones.';
    }

    if (item.status === 'rejected') {
      return 'No fue aprobado.';
    }

    if (item.status === 'expired') {
      return 'Expirado.';
    }

    if (item.status === 'stale') {
      return item.staleReason ?? 'Reemplazado por cambios en el balance.';
    }
  }

  return transactionStatusLabel(item) ?? pendingStatusLabel(item.status);
}
