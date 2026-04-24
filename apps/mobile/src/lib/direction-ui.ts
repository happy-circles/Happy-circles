import { theme } from './theme';

export type LedgerDirection = 'i_owe' | 'owes_me';
export type LedgerTone = 'positive' | 'negative' | 'neutral';
export type DirectionIconName = 'arrow-up-circle-outline' | 'arrow-down-circle-outline';

export interface DirectionVisual {
  readonly label: string;
  readonly icon: DirectionIconName;
  readonly accentColor: string;
  readonly softBackgroundColor: string;
  readonly borderColor: string;
}

const NEGATIVE_DIRECTION_VISUAL: DirectionVisual = {
  label: 'Debes',
  icon: 'arrow-up-circle-outline',
  accentColor: theme.colors.brandCoral,
  softBackgroundColor: '#fff4ef',
  borderColor: theme.colors.brandCoral,
};

const POSITIVE_DIRECTION_VISUAL: DirectionVisual = {
  label: 'Te deben',
  icon: 'arrow-down-circle-outline',
  accentColor: theme.colors.brandGreen,
  softBackgroundColor: '#f1f8eb',
  borderColor: theme.colors.brandGreen,
};

export function directionVisual(direction: LedgerDirection): DirectionVisual {
  return direction === 'owes_me' ? POSITIVE_DIRECTION_VISUAL : NEGATIVE_DIRECTION_VISUAL;
}

export function toneVisual(tone: LedgerTone): DirectionVisual | null {
  if (tone === 'positive') {
    return POSITIVE_DIRECTION_VISUAL;
  }

  if (tone === 'negative') {
    return NEGATIVE_DIRECTION_VISUAL;
  }

  return null;
}
