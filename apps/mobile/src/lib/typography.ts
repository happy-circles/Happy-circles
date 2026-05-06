import { theme } from './theme';

export type TypographyScaleRole =
  | 'display'
  | 'title'
  | 'body'
  | 'caption'
  | 'control'
  | 'input'
  | 'fixed';

export type TypographyVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'caption'
  | 'display'
  | 'amountHero'
  | 'amountLarge'
  | 'otpDigit'
  | 'badge'
  | 'micro'
  | 'chartLabel'
  | 'control'
  | 'input';

export interface TypographyVariantDefinition {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly maxFontSizeMultiplier: number;
  readonly scaleRole: TypographyScaleRole;
}

export const typographyScaleRoleMaxFontSizeMultiplier = {
  display: 1.1,
  title: 1.2,
  body: 1.3,
  caption: 1.35,
  control: 1.15,
  input: 1.25,
  fixed: 1,
} as const satisfies Record<TypographyScaleRole, number>;

function defineTypographyVariant(
  scaleRole: TypographyScaleRole,
  fontSize: number,
  lineHeight: number,
): TypographyVariantDefinition {
  return {
    fontSize,
    lineHeight,
    maxFontSizeMultiplier: typographyScaleRoleMaxFontSizeMultiplier[scaleRole],
    scaleRole,
  };
}

export const typographyVariants = {
  largeTitle: defineTypographyVariant('title', theme.typography.largeTitle, 40),
  title1: defineTypographyVariant('title', theme.typography.title1, 34),
  title2: defineTypographyVariant('title', theme.typography.title2, 28),
  title3: defineTypographyVariant('title', theme.typography.title3, 24),
  body: defineTypographyVariant('body', theme.typography.body, 22),
  callout: defineTypographyVariant('body', theme.typography.callout, 20),
  footnote: defineTypographyVariant('caption', theme.typography.footnote, 18),
  caption: defineTypographyVariant('caption', theme.typography.caption, 16),
  display: defineTypographyVariant('display', theme.typography.largeTitle, 40),
  amountHero: defineTypographyVariant('display', 44, 48),
  amountLarge: defineTypographyVariant('display', 40, 44),
  otpDigit: defineTypographyVariant('control', 18, 22),
  badge: defineTypographyVariant('control', 11, 14),
  micro: defineTypographyVariant('control', 10, 12),
  chartLabel: defineTypographyVariant('fixed', 10, 12),
  control: defineTypographyVariant('control', theme.typography.body, 20),
  input: defineTypographyVariant('input', theme.typography.body, 20),
} as const satisfies Record<TypographyVariant, TypographyVariantDefinition>;

export function inferTypographyScaleRole(fontSize: number | undefined): TypographyScaleRole {
  if (typeof fontSize !== 'number') {
    return 'body';
  }

  if (fontSize >= 30) {
    return 'display';
  }

  if (fontSize >= theme.typography.title3) {
    return 'title';
  }

  if (fontSize <= theme.typography.caption) {
    return 'control';
  }

  return 'body';
}

export function getTypographyMaxFontSizeMultiplier({
  fontSize,
  scaleRole,
  variant,
}: {
  readonly fontSize?: number;
  readonly scaleRole?: TypographyScaleRole;
  readonly variant?: TypographyVariant;
}) {
  if (scaleRole) {
    return typographyScaleRoleMaxFontSizeMultiplier[scaleRole];
  }

  if (variant) {
    return typographyVariants[variant].maxFontSizeMultiplier;
  }

  return typographyScaleRoleMaxFontSizeMultiplier[inferTypographyScaleRole(fontSize)];
}
