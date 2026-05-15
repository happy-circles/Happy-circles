import { theme, type AppTheme } from './theme';

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

function negativeDirectionVisual(activeTheme: AppTheme = theme): DirectionVisual {
  return {
    label: 'Por pagar',
    icon: 'arrow-up-circle-outline',
    accentColor: activeTheme.colors.brandCoral,
    softBackgroundColor: activeTheme.colors.dangerSoft,
    borderColor: activeTheme.colors.brandCoral,
  };
}

function positiveDirectionVisual(activeTheme: AppTheme = theme): DirectionVisual {
  return {
    label: 'Por cobrar',
    icon: 'arrow-down-circle-outline',
    accentColor: activeTheme.colors.brandGreen,
    softBackgroundColor: activeTheme.colors.successSoft,
    borderColor: activeTheme.colors.brandGreen,
  };
}

export function directionVisual(
  direction: LedgerDirection,
  activeTheme: AppTheme = theme,
): DirectionVisual {
  return direction === 'owes_me'
    ? positiveDirectionVisual(activeTheme)
    : negativeDirectionVisual(activeTheme);
}

export function toneVisual(
  tone: LedgerTone,
  activeTheme: AppTheme = theme,
): DirectionVisual | null {
  if (tone === 'positive') {
    return positiveDirectionVisual(activeTheme);
  }

  if (tone === 'negative') {
    return negativeDirectionVisual(activeTheme);
  }

  return null;
}
