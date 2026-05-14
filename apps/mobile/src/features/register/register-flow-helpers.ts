import type { ActivityItemDto } from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { formatCop } from '@/lib/data';

export type Direction = 'i_owe' | 'owes_me';
export type RegisterMode = 'create' | 'correction';
export type RegisterUserTransactionCategory = Exclude<TransactionCategory, 'cycle'>;

export const DEFAULT_DIRECTION: Direction = 'i_owe';
export const AMOUNT_SUGGESTIONS = [20000, 50000, 100000] as const;
const DEFAULT_CORRECTION_CATEGORY: RegisterUserTransactionCategory = 'other';
const USER_TRANSACTION_CATEGORIES: readonly RegisterUserTransactionCategory[] = [
  'food_drinks',
  'transport',
  'entertainment',
  'services',
  'home',
  'other',
];

export interface RegisterPerson {
  readonly avatarUrl?: string | null;
  readonly displayName: string;
  readonly userId: string;
}

export function activityRecencyScore(value: string): number {
  const normalized = value.trim().toLocaleLowerCase('es-CO');

  if (normalized.length === 0 || normalized === 'sin movimientos todavia') {
    return 0;
  }

  if (normalized.includes('hoy')) {
    return 120;
  }

  if (normalized.includes('ayer')) {
    return 90;
  }

  const hoursMatch = normalized.match(/(\d+)\s+hora/);
  if (hoursMatch) {
    const hours = Number.parseInt(hoursMatch[1] ?? '0', 10);
    return Math.max(0, 100 - hours);
  }

  const minutesMatch = normalized.match(/(\d+)\s+min/);
  if (minutesMatch) {
    return 140;
  }

  if (normalized.includes('semana')) {
    return 20;
  }

  return 45;
}

export function personRelevanceScore(
  person: RegisterPerson & {
    readonly lastActivityLabel: string;
    readonly netAmountMinor: number;
    readonly pendingCount: number;
  },
): number {
  const pendingWeight = person.pendingCount * 1000;
  const recencyWeight = activityRecencyScore(person.lastActivityLabel) * 10;
  const balanceWeight = Math.min(person.netAmountMinor / 1000, 200);

  return pendingWeight + recencyWeight + balanceWeight;
}

export function buildDraftPreview(input: {
  readonly amountMinor: number;
  readonly counterpartyName: string;
  readonly direction: Direction;
}): { readonly summary: string; readonly tone: Direction } {
  const amountLabel = formatCop(input.amountMinor);

  if (input.direction === 'owes_me') {
    return {
      summary: `${input.counterpartyName} te debe ${amountLabel}.`,
      tone: input.direction,
    };
  }

  return {
    summary: `Debes ${amountLabel} a ${input.counterpartyName}.`,
    tone: input.direction,
  };
}

export function sanitizeAmountInput(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatAmountInput(value: string): string {
  if (value.trim().length === 0) {
    return '';
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '';
  }

  return parsed.toLocaleString('es-CO');
}

export function resolveRegisterRouteParams(input: {
  readonly direction?: string | string[];
  readonly mode?: string | string[];
  readonly personId?: string | string[];
  readonly requestId?: string | string[];
}): {
  readonly correctionRequestId: string;
  readonly contextualDirection: Direction | null;
  readonly contextualPersonId: string;
  readonly initialDirection: Direction;
  readonly mode: RegisterMode;
} {
  const rawDirection = Array.isArray(input.direction) ? input.direction[0] : input.direction;
  const rawMode = Array.isArray(input.mode) ? input.mode[0] : input.mode;
  const rawRequestId = Array.isArray(input.requestId) ? input.requestId[0] : input.requestId;
  const contextualDirection: Direction | null =
    rawDirection === 'i_owe' || rawDirection === 'owes_me' ? rawDirection : null;
  return {
    correctionRequestId: typeof rawRequestId === 'string' ? rawRequestId : '',
    contextualDirection,
    contextualPersonId: typeof input.personId === 'string' ? input.personId : '',
    initialDirection: contextualDirection ?? DEFAULT_DIRECTION,
    mode: rawMode === 'correction' ? 'correction' : 'create',
  };
}

export function directionFromTransactionTone(value: ActivityItemDto['tone']): Direction {
  return value === 'positive' ? 'owes_me' : 'i_owe';
}

export function buildCorrectionDraft(item: ActivityItemDto): {
  readonly amount: string;
  readonly category: RegisterUserTransactionCategory;
  readonly description: string;
  readonly direction: Direction;
} {
  const historySteps = item.pendingHistorySteps ?? [];
  const currentStep =
    historySteps.find((step) => step.isCurrent) ?? historySteps[historySteps.length - 1] ?? null;
  const description = currentStep?.description ?? splitPendingSubtitle(item.subtitle).detail;
  const amountMinor = currentStep?.amountMinor ?? item.amountMinor ?? 0;
  const categoryValue = currentStep?.category ?? item.category;

  return {
    amount: amountMinor > 0 ? String(Math.max(1, Math.round(amountMinor / 100))) : '',
    category: isRegisterUserTransactionCategory(categoryValue)
      ? categoryValue
      : DEFAULT_CORRECTION_CATEGORY,
    description,
    direction: directionFromTransactionTone(item.tone),
  };
}

export function buildCorrectionPendingContent(item: ActivityItemDto): {
  readonly createdAtLabel: string;
  readonly createdByLabel: string;
  readonly detail: string;
} {
  const [createdByLabel, detail, createdAtLabel] = splitPendingSubtitleSegments(item.subtitle);

  return {
    createdAtLabel: createdAtLabel ?? '',
    createdByLabel: createdByLabel ?? 'Persona',
    detail: detail ?? item.subtitle,
  };
}

function isRegisterUserTransactionCategory(
  value: string | null | undefined,
): value is RegisterUserTransactionCategory {
  return USER_TRANSACTION_CATEGORIES.includes(value as RegisterUserTransactionCategory);
}

function splitPendingSubtitle(value: string): { readonly detail: string } {
  const [, detail] = splitPendingSubtitleSegments(value);

  return {
    detail: detail ?? '',
  };
}

function splitPendingSubtitleSegments(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
