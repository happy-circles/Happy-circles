import type { Href } from 'expo-router';

import type { ActivityItemDto } from '@happy-circles/application';

import type { HistoryCaseItem } from '@/lib/history-cases';

export type PersonSegmentKey = 'pending' | 'history';
export type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute';

export const PERSON_SEGMENT_KEYS: readonly PersonSegmentKey[] = ['pending', 'history'];
export const RESULT_OVERLAY_DURATION_MS = 2200;

export function readResultStatus(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const status = (value as Record<string, unknown>)['status'];
  return typeof status === 'string' ? status : null;
}

export function readNestedStatus(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return readResultStatus((value as Record<string, unknown>)[key]);
}

export function splitSubtitleSegments(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function buildFinancialRequestPendingContent(item: ActivityItemDto): {
  readonly createdAtLabel: string;
  readonly createdByLabel: string;
  readonly detail: string;
} {
  const parts = splitSubtitleSegments(item.subtitle);
  const [createdByLabel, detail, createdAtLabel] = parts;

  return {
    createdAtLabel: createdAtLabel ?? '',
    createdByLabel: createdByLabel ?? 'Persona',
    detail: detail ?? item.subtitle,
  };
}

export function historyStepMetaLabel(step: HistoryCaseItem): string | null {
  return step.happenedAtLabel ?? null;
}

export function pendingSnippetTone(
  item: ActivityItemDto,
): 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle' {
  if (item.kind === 'settlement_proposal' && item.status === 'approved') {
    return 'cycle';
  }

  if (item.status === 'pending_approvals' || item.status === 'requires_you') {
    return 'warning';
  }

  if (item.status === 'approved') {
    return 'primary';
  }

  if (item.status === 'rejected') {
    return 'danger';
  }

  return 'neutral';
}

export function pendingStatusLabel(status: string): string {
  if (status === 'pending_approvals') {
    return 'Pendiente';
  }

  if (status === 'approved') {
    return 'Aprobado';
  }

  if (status === 'waiting_other_side') {
    return 'En espera';
  }

  return status;
}

export function buildFocusCandidates(value: string | undefined): Set<string> {
  const candidates = new Set<string>();
  if (!value) {
    return candidates;
  }

  candidates.add(value);
  try {
    candidates.add(decodeURIComponent(value));
  } catch {
    // The raw value is still usable if decoding fails.
  }

  return candidates;
}

export function matchesFocusedTransaction(
  item: Pick<ActivityItemDto, 'id' | 'originRequestId' | 'originSettlementProposalId'>,
  candidates: ReadonlySet<string>,
): boolean {
  return (
    candidates.has(item.id) ||
    (item.originRequestId ? candidates.has(item.originRequestId) : false) ||
    (item.originSettlementProposalId ? candidates.has(item.originSettlementProposalId) : false)
  );
}

export function buildPersonRegisterHref(
  personId: string,
  direction: 'i_owe' | 'owes_me',
): Href {
  return {
    pathname: '/register',
    params: {
      direction,
      personId,
    },
  } as Href;
}
