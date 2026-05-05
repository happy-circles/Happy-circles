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

const EXTRA_TRANSACTION_CATEGORY_LABELS = {
  friendship: 'Amistad',
  friendship_qr: 'QR',
  access_key: 'Acceso',
} as const;

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

const EXTRA_TRANSACTION_CATEGORY_VISUALS: Record<
  keyof typeof EXTRA_TRANSACTION_CATEGORY_LABELS,
  {
    readonly icon: string;
    readonly color: string;
    readonly backgroundColor: string;
  }
> = {
  friendship: {
    icon: 'person-add-outline',
    color: '#2563eb',
    backgroundColor: '#eaf1ff',
  },
  friendship_qr: {
    icon: 'qr-code-outline',
    color: '#047857',
    backgroundColor: '#e6f7ef',
  },
  access_key: {
    icon: 'key-outline',
    color: '#7c3aed',
    backgroundColor: '#f0eaff',
  },
};

function resolveTransactionCategoryVisual(value: string | null | undefined): {
  readonly icon: string;
  readonly color: string;
  readonly backgroundColor: string;
} {
  const normalized = value?.trim();

  if (normalized && normalized in EXTRA_TRANSACTION_CATEGORY_VISUALS) {
    return EXTRA_TRANSACTION_CATEGORY_VISUALS[
      normalized as keyof typeof EXTRA_TRANSACTION_CATEGORY_VISUALS
    ];
  }

  return TRANSACTION_CATEGORY_VISUALS[normalizeTransactionCategory(normalized)];
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
