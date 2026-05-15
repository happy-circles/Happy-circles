import type { ActivityItemDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { formatCop } from './data';
import { cycleActivityKind, isCircleActivityItem, isCircleLifecycleOnly } from './cycle-activity';
import { cardStateColor, circleStatusCopy, moneyStatusCopy } from './card-language';
import { theme } from './theme';
import {
  normalizeTransactionCategory,
  transactionCategoryLabel,
  transactionCategoryColor,
} from './transaction-categories';

export type TransactionVisualTone = 'positive' | 'negative' | 'neutral' | 'danger' | 'cycle';
export type TransactionStatusTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'cycle';
export type TransactionCardDensity = 'summary' | 'list' | 'action' | 'case';

export const PENDING_TRANSACTION_STATUSES = new Set([
  'pending',
  'requires_you',
  'waiting_other_side',
  'pending_approvals',
  'approved',
]);

const NO_BALANCE_STATUSES = new Set(['rejected', 'canceled', 'expired', 'stale']);

export function splitTransactionSubtitle(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function firstNameLabel(value: string): string {
  const [name] = value.trim().split(/\s+/);
  return name && name.length > 0 ? name : 'Persona';
}

function formatRelativeTransactionLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'recientemente';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'hace un momento';
  }

  if (diffMs < hour) {
    return `hace ${Math.max(1, Math.round(diffMs / minute))} min`;
  }

  if (diffMs < day) {
    return `hace ${Math.max(1, Math.round(diffMs / hour))} h`;
  }

  if (diffMs < 7 * day) {
    return `hace ${Math.max(1, Math.round(diffMs / day))} d`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

export function isCycleTransactionItem(item: Pick<ActivityItemDto, 'category' | 'kind'>): boolean {
  return isCircleActivityItem(item);
}

export function isPendingTransactionItem(item: ActivityItemDto): boolean {
  return (
    (item.kind === 'financial_request' || item.kind === 'settlement_proposal') &&
    PENDING_TRANSACTION_STATUSES.has(item.status)
  );
}

export function isConsolidatedTransactionItem(item: ActivityItemDto): boolean {
  return (
    item.kind !== 'friendship_invite' &&
    item.kind !== 'account_invite' &&
    !PENDING_TRANSACTION_STATUSES.has(item.status)
  );
}

export function isNoBalanceTransactionStatus(status: string): boolean {
  return NO_BALANCE_STATUSES.has(status);
}

export function transactionAmountIsVoided(
  item: Pick<ActivityItemDto, 'status'> &
    Partial<Pick<ActivityItemDto, 'category' | 'kind' | 'id' | 'originSettlementProposalId'>>,
): boolean {
  if (
    item.kind &&
    isCircleActivityItem({
      category: item.category,
      kind: item.kind,
    }) &&
    isCircleLifecycleOnly({
      category: item.category,
      id: item.id ?? 'cycle',
      kind: item.kind,
      originSettlementProposalId: item.originSettlementProposalId,
      status: item.status,
    })
  ) {
    return true;
  }

  return isNoBalanceTransactionStatus(item.status);
}

export function transactionFocusId(
  item: Pick<ActivityItemDto, 'id' | 'originRequestId' | 'originSettlementProposalId'>,
): string {
  return item.originSettlementProposalId ?? item.originRequestId ?? item.id;
}

export function transactionVisualCategory(
  item: Pick<ActivityItemDto, 'category' | 'kind'>,
): TransactionCategory {
  return isCycleTransactionItem(item) ? 'cycle' : normalizeTransactionCategory(item.category);
}

export function transactionAccentColor(item: ActivityItemDto): string {
  if (isCycleTransactionItem(item)) {
    return transactionCategoryColor('cycle');
  }

  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return theme.colors.danger;
  }

  if (item.tone === 'negative') {
    return theme.colors.warning;
  }

  if (item.tone === 'neutral') {
    return theme.colors.textMuted;
  }

  return theme.colors.success;
}

export function transactionToneColor(item: ActivityItemDto): string {
  if (isCycleTransactionItem(item)) {
    const circleKind = cycleActivityKind(item);

    if (
      circleKind === 'lifecycle_rejected' ||
      item.status === 'rejected' ||
      item.status === 'canceled' ||
      item.status === 'expired'
    ) {
      return theme.colors.danger;
    }

    if (item.status === 'pending_approvals') {
      return cardStateColor('needsAction', 'warning');
    }

    if (
      item.status === 'approved' ||
      circleKind === 'executed_proposal' ||
      circleKind === 'ledger_posted'
    ) {
      return theme.colors.success;
    }

    if (circleKind === 'lifecycle_replaced' || item.status === 'waiting_other_side') {
      return cardStateColor('ready', 'cycle');
    }

    return cardStateColor('ready', 'cycle');
  }

  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return theme.colors.danger;
  }

  if (item.tone === 'positive') {
    return theme.colors.success;
  }

  if (item.tone === 'negative') {
    return theme.colors.warning;
  }

  return theme.colors.text;
}

export function transactionDirectionLabel(item: ActivityItemDto): string {
  if (isCycleTransactionItem(item)) {
    return 'Happy Circle';
  }

  if (isNoBalanceTransactionStatus(item.status)) {
    return 'Sin saldo';
  }

  if (item.tone === 'positive') {
    return 'Por cobrar';
  }

  if (item.tone === 'negative') {
    return 'Por pagar';
  }

  return 'Sin saldo';
}

export function transactionAmountLabel(item: ActivityItemDto): string | null {
  if (typeof item.amountMinor !== 'number' || item.amountMinor <= 0) {
    return null;
  }

  return formatCop(Math.abs(item.amountMinor));
}

export function transactionStatusLabel(item: ActivityItemDto): string | null {
  if (item.kind === 'settlement_proposal' || isCycleTransactionItem(item)) {
    const circleKind = cycleActivityKind(item);

    if (item.status === 'expired') {
      return 'Expirado';
    }

    if (circleKind === 'lifecycle_rejected') {
      return 'No completado';
    }

    if (circleKind === 'lifecycle_replaced') {
      return 'Reemplazado';
    }

    if (circleKind === 'ledger_posted') {
      return 'Movimiento aplicado';
    }

    if (circleKind === 'executed_proposal') {
      return circleStatusCopy.completed;
    }

    if (item.status === 'pending_approvals') {
      return circleStatusCopy.requiresYou;
    }

    if (item.status === 'waiting_other_side') {
      return circleStatusCopy.waitingOthers;
    }

    if (item.status === 'approved') {
      return circleStatusCopy.approved;
    }
  }

  if (item.status === 'requires_you') {
    return moneyStatusCopy.requiresYou;
  }

  if (item.status === 'waiting_other_side') {
    return moneyStatusCopy.waitingOtherSide;
  }

  if (item.status === 'accepted') {
    return moneyStatusCopy.completed;
  }

  if (item.status === 'rejected') {
    return moneyStatusCopy.rejected;
  }

  if (item.status === 'canceled') {
    return moneyStatusCopy.canceled;
  }

  if (item.status === 'expired') {
    return moneyStatusCopy.expired;
  }

  if (item.status === 'amended') {
    return moneyStatusCopy.amended;
  }

  if (item.status === 'pending') {
    return 'Pendiente';
  }

  if (item.status === 'posted') {
    return 'Registrado';
  }

  return null;
}

export function transactionStatusTone(item: ActivityItemDto): TransactionStatusTone {
  if (isCycleTransactionItem(item)) {
    const circleKind = cycleActivityKind(item);

    if (circleKind === 'lifecycle_rejected') {
      if (item.status === 'expired') {
        return 'danger';
      }

      return 'danger';
    }

    if (circleKind === 'lifecycle_replaced' || item.status === 'waiting_other_side') {
      return 'cycle';
    }

    if (item.status === 'pending_approvals') {
      return 'warning';
    }

    if (
      item.status === 'approved' ||
      circleKind === 'executed_proposal' ||
      circleKind === 'ledger_posted'
    ) {
      return 'success';
    }

    if (item.status === 'expired') {
      return 'danger';
    }

    return 'cycle';
  }

  if (item.status === 'requires_you' || item.status === 'pending' || item.status === 'amended') {
    return 'warning';
  }

  if (item.status === 'accepted' || item.status === 'posted') {
    return 'success';
  }

  if (item.status === 'rejected' || item.status === 'expired' || item.status === 'canceled') {
    return 'danger';
  }

  if (item.status === 'approved') {
    return 'primary';
  }

  return 'neutral';
}

export function transactionShouldSurfaceStatus(
  item: ActivityItemDto,
  options: {
    readonly density: TransactionCardDensity;
    readonly unread?: boolean;
  },
): boolean {
  if (options.unread) {
    return true;
  }

  if (options.density === 'case') {
    return (
      item.status === 'requires_you' ||
      item.status === 'pending_approvals' ||
      item.status === 'waiting_other_side' ||
      item.status === 'approved' ||
      item.status === 'rejected' ||
      item.status === 'amended' ||
      item.status === 'stale' ||
      item.status === 'expired' ||
      item.status === 'canceled'
    );
  }

  if (options.density === 'action' || options.density === 'list') {
    return (
      item.status === 'requires_you' ||
      item.status === 'waiting_other_side' ||
      item.status === 'pending_approvals' ||
      item.status === 'approved' ||
      item.status === 'rejected' ||
      item.status === 'amended' ||
      item.status === 'stale' ||
      item.status === 'expired' ||
      item.status === 'canceled'
    );
  }

  return (
    isCycleTransactionItem(item) ||
    item.status === 'requires_you' ||
    item.status === 'waiting_other_side' ||
    item.status === 'approved' ||
    item.status === 'rejected' ||
    item.status === 'stale' ||
    item.status === 'expired' ||
    item.status === 'canceled'
  );
}

export function transactionSummaryMetaLabel(item: ActivityItemDto): string {
  return transactionTimeLabel(item);
}

export function transactionCreatorLabel(item: ActivityItemDto, actorLabel: string): string {
  if (isCycleTransactionItem(item)) {
    return 'Happy Circle';
  }

  const subtitleParts = splitTransactionSubtitle(item.subtitle);
  if (item.kind === 'financial_request' && subtitleParts[0]) {
    return subtitleParts[0];
  }

  const titleCreator = item.title.match(
    /^(.+?)\s+(propuso|acept[oó]|registr[oó]|aplic[oó]|no acept[oó])\b/i,
  )?.[1];
  if (titleCreator?.trim()) {
    return titleCreator.trim();
  }

  const subtitleCreator = subtitleParts[0];
  if (
    subtitleCreator &&
    subtitleCreator !== 'Usuario' &&
    subtitleCreator !== 'Sistema' &&
    subtitleCreator !== 'Happy Circle'
  ) {
    return subtitleCreator;
  }

  if (item.sourceType === 'system') {
    return 'Sistema';
  }

  return firstNameLabel(actorLabel);
}

export function transactionTimeLabel(item: ActivityItemDto): string {
  const subtitleParts = splitTransactionSubtitle(item.subtitle);

  return (
    item.happenedAtLabel ??
    subtitleParts[subtitleParts.length - 1] ??
    (item.happenedAt ? formatRelativeTransactionLabel(item.happenedAt) : 'reciente')
  );
}

export function transactionCreatedByMetaLabel(item: ActivityItemDto, actorLabel: string): string {
  const creatorLabel = transactionCreatorLabel(item, actorLabel);
  const createdByText =
    creatorLabel === 'Tú' || creatorLabel === 'Tu' ? 'Creado por ti' : `Creado por ${creatorLabel}`;

  return `${createdByText} - ${transactionTimeLabel(item)}`;
}

export function transactionMetaLabel(item: ActivityItemDto): string {
  const subtitleParts = splitTransactionSubtitle(item.subtitle);
  const timeLabel = item.happenedAtLabel ?? subtitleParts[subtitleParts.length - 1] ?? 'Reciente';
  return `${timeLabel} | ${transactionCategoryLabel(transactionVisualCategory(item))}`;
}

export function transactionContextLabel(item: ActivityItemDto, actorLabel: string): string {
  const subtitleParts = splitTransactionSubtitle(item.subtitle);

  if (isCycleTransactionItem(item)) {
    const circleKind = cycleActivityKind(item);

    if (circleKind === 'lifecycle_rejected') {
      return 'No cambió el saldo';
    }

    if (circleKind === 'lifecycle_replaced') {
      return 'Versión reemplazada';
    }

    if (item.status === 'pending_approvals') {
      return 'Revisa y aprueba el Circle';
    }

    if (item.status === 'waiting_other_side') {
      return circleStatusCopy.waitingOthers;
    }

    if (item.status === 'approved') {
      return circleStatusCopy.approved;
    }

    if (circleKind === 'ledger_posted') {
      return cycleLedgerContextLabel(item);
    }

    if (circleKind === 'executed_proposal') {
      return 'Circle cerrado';
    }

    return 'Happy Circle';
  }

  if (isNoBalanceTransactionStatus(item.status)) {
    return 'No cambió el saldo';
  }

  const timeLabel = item.happenedAtLabel ?? subtitleParts[subtitleParts.length - 1] ?? '';
  const normalizedSkips = new Set(
    [actorLabel, timeLabel, 'Usuario', 'Sistema', 'Happy Circle']
      .map((value) => value.trim().toLocaleLowerCase('es-CO'))
      .filter(Boolean),
  );

  const candidates = [item.detail, subtitleParts[1], subtitleParts[0], item.title];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value || value.toLocaleLowerCase('es-CO') === 'sin descripcion') {
      continue;
    }

    const normalized = value.toLocaleLowerCase('es-CO');
    if (normalizedSkips.has(normalized) || /^cop\s/i.test(value)) {
      continue;
    }

    return value;
  }

  return transactionCategoryLabel(transactionVisualCategory(item));
}

function cycleLedgerContextLabel(item: Pick<ActivityItemDto, 'flowLabel'>): string {
  const [from, to] = (item.flowLabel ?? '').split('->').map((part) => part.trim());

  if ((from === 'Tú' || from === 'Tu') && to) {
    return `Pagaste a ${to}`;
  }

  if ((to === 'Tú' || to === 'Tu') && from) {
    return `${from} te pagó`;
  }

  return 'Movimiento de Circle aplicado';
}
