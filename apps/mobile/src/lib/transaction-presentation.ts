import type { ActivityItemDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { formatCop } from './data';
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

export function isCycleTransactionItem(
  item: Pick<ActivityItemDto, 'category' | 'kind'>,
): boolean {
  return item.category === 'cycle' || item.kind === 'settlement' || item.kind === 'settlement_proposal';
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

export function transactionAmountIsVoided(item: Pick<ActivityItemDto, 'status'>): boolean {
  return isNoBalanceTransactionStatus(item.status);
}

export function transactionFocusId(item: ActivityItemDto): string {
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
    return transactionCategoryColor('cycle');
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
    return 'Te deben';
  }

  if (item.tone === 'negative') {
    return 'Debes';
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
    if (item.status === 'pending_approvals') {
      return 'Happy Circle pendiente';
    }

    if (item.status === 'waiting_other_side') {
      return 'Esperando aprobaciones';
    }

    if (item.status === 'approved') {
      return 'Happy Circle listo';
    }

    if (item.status === 'executed' || item.status === 'posted') {
      return 'Completo';
    }

    if (item.status === 'rejected') {
      return 'No completo';
    }

    if (item.status === 'stale') {
      return 'Reemplazado';
    }
  }

  if (item.status === 'requires_you') {
    return 'Requiere tu respuesta';
  }

  if (item.status === 'waiting_other_side') {
    return 'Esperando respuesta';
  }

  if (item.status === 'accepted') {
    return 'Completo';
  }

  if (item.status === 'rejected') {
    return 'Rechazado';
  }

  if (item.status === 'canceled') {
    return 'Cancelado';
  }

  if (item.status === 'expired') {
    return 'Expirado';
  }

  if (item.status === 'amended') {
    return 'Nuevo monto';
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
    if (item.status === 'rejected') {
      return 'danger';
    }

    if (item.status === 'stale') {
      return 'neutral';
    }

    if (item.status === 'pending_approvals' || item.status === 'waiting_other_side') {
      return 'warning';
    }

    return 'cycle';
  }

  if (
    item.status === 'requires_you' ||
    item.status === 'pending' ||
    item.status === 'amended'
  ) {
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

export function transactionMetaLabel(item: ActivityItemDto): string {
  const subtitleParts = splitTransactionSubtitle(item.subtitle);
  const timeLabel = item.happenedAtLabel ?? subtitleParts[subtitleParts.length - 1] ?? 'Reciente';
  return `${timeLabel} | ${transactionCategoryLabel(transactionVisualCategory(item))}`;
}

export function transactionContextLabel(item: ActivityItemDto, actorLabel: string): string {
  const subtitleParts = splitTransactionSubtitle(item.subtitle);

  if (isCycleTransactionItem(item)) {
    if (item.status === 'rejected') {
      return 'Este Circle no se completo';
    }

    if (item.status === 'stale') {
      return 'Este Circle fue reemplazado';
    }

    if (item.status === 'pending_approvals') {
      return 'Revisa y aprueba el Circle';
    }

    if (item.status === 'waiting_other_side') {
      return 'Esperando aprobaciones';
    }

    if (item.status === 'approved') {
      return 'Listo para completar';
    }

    return 'Completaste un Circle!';
  }

  if (isNoBalanceTransactionStatus(item.status)) {
    return 'No cambio el saldo';
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
