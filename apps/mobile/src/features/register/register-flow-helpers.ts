import { formatCop } from '@/lib/data';

export type Direction = 'i_owe' | 'owes_me';

export const DEFAULT_DIRECTION: Direction = 'i_owe';
export const AMOUNT_SUGGESTIONS = [20000, 50000, 100000] as const;

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
  readonly personId?: string | string[];
}): {
  readonly contextualDirection: Direction | null;
  readonly contextualPersonId: string;
  readonly initialDirection: Direction;
} {
  const rawDirection = Array.isArray(input.direction) ? input.direction[0] : input.direction;
  const contextualDirection: Direction | null =
    rawDirection === 'i_owe' || rawDirection === 'owes_me' ? rawDirection : null;
  return {
    contextualDirection,
    contextualPersonId: typeof input.personId === 'string' ? input.personId : '',
    initialDirection: contextualDirection ?? DEFAULT_DIRECTION,
  };
}
