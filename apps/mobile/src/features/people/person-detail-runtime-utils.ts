import type { Href } from 'expo-router';

import type { ActivityItemDto } from '@happy-circles/application';

import type { CircleActionFeedbackAction } from '@/components/circle-action-feedback-overlay';
import type { HappyCircleRingParticipant } from '@/components/happy-circle-ring';
import type { HistoryCaseStepViewModel, HistoryCaseTone } from '@/components/history-case-card';
import {
  historyCaseVisualCategory,
  historyImpactLabel,
  historyImpactTone,
  historyTimelineStepActionLabel,
  historyTimelineStepActorLabel,
  historyTimelineStepAmountLabel,
  historyTimelineStepCategory,
  historyTimelineStepConversationSide,
  historyTimelineStepDetailLabel,
  historyTimelineStepMetaLabel,
  type HistoryCase,
  type HistoryCaseItem,
} from '@/lib/history-cases';
import { transactionStatusLabel } from '@/lib/transaction-presentation';
import { pendingStatusLabel, type PersonSegmentKey } from './person-detail-helpers';

export interface PersonDetailBannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

export interface PersonDetailScreenProps {
  readonly focusItemId?: string;
  readonly initialPanel?: PersonSegmentKey;
  readonly userId: string;
}

export const PERSON_DETAIL_FOCUS_HIGHLIGHT_DURATION_MS = 1800;

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

export function buildPersonHistoryConversationSteps(input: {
  readonly caseAmountLabel: string | null;
  readonly counterpartyLabel: string;
  readonly itemCase: HistoryCase<HistoryCaseItem>;
}): readonly HistoryCaseStepViewModel[] {
  const conversationSteps: HistoryCaseStepViewModel[] = [];

  for (let index = 0; index < input.itemCase.steps.length; index += 1) {
    const step = input.itemCase.steps[index];
    if (!step) {
      continue;
    }

    const nextStep = input.itemCase.steps[index + 1];
    const completionLabel =
      step.kind === 'request' && step.status === 'accepted' && nextStep?.status === 'posted'
        ? successfulHistoryCompletionLabel(nextStep)
        : null;
    const amountLabel = historyTimelineStepAmountLabel(input.itemCase, step, index);
    const impact = historyImpactLabel(step);
    const actorLabel = historyTimelineStepActorLabel(step, input.counterpartyLabel);
    const detail = historyTimelineStepDetailLabel(step);
    const previousStep = input.itemCase.steps[index - 1];
    const previousDetail = previousStep ? historyTimelineStepDetailLabel(previousStep) : null;

    const actionLabel = historyTimelineStepActionLabel(step, actorLabel);

    conversationSteps.push({
      actorLabel,
      amountLabel,
      category:
        step.category ??
        historyTimelineStepCategory(input.itemCase, step, index) ??
        historyCaseVisualCategory(input.itemCase),
      conversationSide: historyTimelineStepConversationSide(step, actorLabel),
      detail: detail && detail !== previousDetail ? detail : null,
      id: step.id,
      impact:
        !amountLabel && input.caseAmountLabel && impact?.includes(input.caseAmountLabel)
          ? null
          : impact,
      meta: historyTimelineStepMetaLabel(input.itemCase, step),
      title: completionLabel
        ? mergeAcceptedActionWithCompletion(actionLabel, completionLabel)
        : actionLabel,
      tone: historyImpactTone(step) as HistoryCaseTone,
    });

    if (completionLabel) {
      index += 1;
    }
  }

  return conversationSteps;
}

function mergeAcceptedActionWithCompletion(actionLabel: string, completionLabel: string): string {
  const acceptedAction = actionLabel.match(
    /^(Aceptaste|Aceptó)(?: la propuesta| el nuevo monto| el ajuste)?$/i,
  );

  return acceptedAction?.[1]
    ? `${acceptedAction[1]} y ${completionLabel}`
    : `${actionLabel} y ${completionLabel}`;
}

function successfulHistoryCompletionLabel(step: HistoryCaseItem): string | null {
  const actionLabel = historyTimelineStepActionLabel(step, historyTimelineStepActorLabel(step));
  const normalizedAction = actionLabel.trim();
  const registered = normalizedAction.match(/^(?:se\s+)?registr(?:aste|ó)\s+(.+)$/i);
  if (registered?.[1]) {
    return `se registró ${registered[1]}`;
  }

  const applied = normalizedAction.match(/^(?:se\s+)?aplic(?:aste|ó)\s+(.+)$/i);
  if (applied?.[1]) {
    return `se aplicó ${applied[1]}`;
  }

  return step.kind === 'payment' || step.kind === 'system' ? 'se registró el movimiento' : null;
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
