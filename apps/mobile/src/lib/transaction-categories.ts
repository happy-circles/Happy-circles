import type { TransactionCategory } from '@happy-circles/shared';

import { theme } from './theme';

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

const TRANSACTION_CATEGORY_VISUALS: Record<
  TransactionCategory,
  {
    readonly icon: string;
    readonly color: string;
    readonly backgroundColor: string;
  }
> = {
  food_drinks: {
    icon: 'restaurant-outline',
    color: '#d33f2f',
    backgroundColor: '#fff0e8',
  },
  transport: {
    icon: 'car-sport-outline',
    color: '#2563eb',
    backgroundColor: '#eaf1ff',
  },
  entertainment: {
    icon: 'film-outline',
    color: '#7c3aed',
    backgroundColor: '#f0eaff',
  },
  services: {
    icon: 'calculator-outline',
    color: '#a35f19',
    backgroundColor: '#fff4dd',
  },
  home: {
    icon: 'home-outline',
    color: '#0f8a5f',
    backgroundColor: '#e6f7ef',
  },
  other: {
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#141e33',
    backgroundColor: '#e9edf5',
  },
  cycle: {
    icon: 'happy-outline',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
};

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
  return TRANSACTION_CATEGORY_LABELS[normalizeTransactionCategory(value)];
}

export function transactionCategoryIcon(value: string | null | undefined): string {
  return TRANSACTION_CATEGORY_VISUALS[normalizeTransactionCategory(value)].icon;
}

export function transactionCategoryColor(value: string | null | undefined): string {
  return TRANSACTION_CATEGORY_VISUALS[normalizeTransactionCategory(value)].color;
}

export function transactionCategoryBackgroundColor(value: string | null | undefined): string {
  return TRANSACTION_CATEGORY_VISUALS[normalizeTransactionCategory(value)].backgroundColor;
}
