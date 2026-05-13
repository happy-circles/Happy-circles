import type { TransactionCategory } from '@happy-circles/shared';

import { getRuntimeTheme, type AppTheme } from './theme';

export type UserTransactionCategory = Exclude<TransactionCategory, 'cycle'>;

export const DEFAULT_TRANSACTION_CATEGORY: UserTransactionCategory = 'other';

export const USER_TRANSACTION_CATEGORIES: readonly UserTransactionCategory[] = [
  'food_drinks',
  'transport',
  'entertainment',
  'services',
  'home',
  'other',
];

const TRANSACTION_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  food_drinks: 'Comida',
  transport: 'Transporte',
  entertainment: 'Entretenimiento',
  services: 'Servicios',
  home: 'Hogar',
  other: 'Otra',
  cycle: 'Happy Circle',
};

const EXTRA_TRANSACTION_CATEGORY_LABELS = {
  friendship: 'Amistad',
  friendship_qr: 'QR',
  access_key: 'Acceso',
} as const;

type TransactionCategoryVisual = {
  readonly icon: string;
  readonly color: string;
  readonly backgroundColor: string;
};

const TRANSACTION_CATEGORY_VISUALS: Record<
  TransactionCategory,
  (activeTheme: AppTheme) => TransactionCategoryVisual
> = {
  food_drinks: (activeTheme) => ({
    icon: 'restaurant-outline',
    color: activeTheme.palette.category.food.color,
    backgroundColor: activeTheme.palette.category.food.backgroundColor,
  }),
  transport: (activeTheme) => ({
    icon: 'car-sport-outline',
    color: activeTheme.palette.category.cycle.color,
    backgroundColor: activeTheme.palette.category.cycle.backgroundColor,
  }),
  entertainment: (activeTheme) => ({
    icon: 'film-outline',
    color: activeTheme.palette.category.fun.color,
    backgroundColor: activeTheme.palette.category.fun.backgroundColor,
  }),
  services: (activeTheme) => ({
    icon: 'calculator-outline',
    color: activeTheme.palette.category.transport.color,
    backgroundColor: activeTheme.palette.category.transport.backgroundColor,
  }),
  home: (activeTheme) => ({
    icon: 'home-outline',
    color: activeTheme.palette.category.home.color,
    backgroundColor: activeTheme.palette.category.home.backgroundColor,
  }),
  other: (activeTheme) => ({
    icon: 'ellipsis-horizontal-circle-outline',
    color: activeTheme.palette.category.other.color,
    backgroundColor: activeTheme.palette.category.other.backgroundColor,
  }),
  cycle: (activeTheme) => ({
    icon: 'happy-outline',
    color: activeTheme.colors.cycle,
    backgroundColor: activeTheme.colors.cycleSoft,
  }),
};

const EXTRA_TRANSACTION_CATEGORY_VISUALS: Record<
  keyof typeof EXTRA_TRANSACTION_CATEGORY_LABELS,
  (activeTheme: AppTheme) => TransactionCategoryVisual
> = {
  friendship: (activeTheme) => ({
    icon: 'person-add-outline',
    color: activeTheme.palette.category.cycle.color,
    backgroundColor: activeTheme.palette.category.cycle.backgroundColor,
  }),
  friendship_qr: (activeTheme) => ({
    icon: 'qr-code-outline',
    color: activeTheme.palette.category.home.color,
    backgroundColor: activeTheme.palette.category.home.backgroundColor,
  }),
  access_key: (activeTheme) => ({
    icon: 'key-outline',
    color: activeTheme.palette.category.fun.color,
    backgroundColor: activeTheme.palette.category.fun.backgroundColor,
  }),
};

function resolveTransactionCategoryVisual(value: string | null | undefined): {
  readonly icon: string;
  readonly color: string;
  readonly backgroundColor: string;
} {
  const normalized = value?.trim();
  const activeTheme = getRuntimeTheme();

  if (normalized && normalized in EXTRA_TRANSACTION_CATEGORY_VISUALS) {
    return EXTRA_TRANSACTION_CATEGORY_VISUALS[
      normalized as keyof typeof EXTRA_TRANSACTION_CATEGORY_VISUALS
    ](activeTheme);
  }

  return TRANSACTION_CATEGORY_VISUALS[normalizeTransactionCategory(normalized)](activeTheme);
}

export function isUserTransactionCategory(
  value: string | null | undefined,
): value is UserTransactionCategory {
  return USER_TRANSACTION_CATEGORIES.includes(value as UserTransactionCategory);
}

export function normalizeTransactionCategory(
  value: string | null | undefined,
): TransactionCategory {
  if (value === 'cycle') {
    return 'cycle';
  }

  return isUserTransactionCategory(value) ? value : DEFAULT_TRANSACTION_CATEGORY;
}

export function transactionCategoryLabel(value: string | null | undefined): string {
  const normalized = value?.trim();

  if (normalized && normalized in EXTRA_TRANSACTION_CATEGORY_LABELS) {
    return EXTRA_TRANSACTION_CATEGORY_LABELS[
      normalized as keyof typeof EXTRA_TRANSACTION_CATEGORY_LABELS
    ];
  }

  return TRANSACTION_CATEGORY_LABELS[normalizeTransactionCategory(normalized)];
}

export function transactionCategoryIcon(value: string | null | undefined): string {
  return resolveTransactionCategoryVisual(value).icon;
}

export function transactionCategoryColor(value: string | null | undefined): string {
  return resolveTransactionCategoryVisual(value).color;
}

export function transactionCategoryBackgroundColor(value: string | null | undefined): string {
  return resolveTransactionCategoryVisual(value).backgroundColor;
}
