import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  getTypographyMaxFontSizeMultiplier,
  inferTypographyScaleRole,
  typographyScaleRoleMaxFontSizeMultiplier,
  typographyVariants,
  type TypographyVariant,
  type TypographyVariantDefinition,
} from './typography';

describe('typography scaling policy', () => {
  it('defines complete scaling metadata for every text variant', () => {
    const variants = Object.entries(typographyVariants) as Array<
      [TypographyVariant, TypographyVariantDefinition]
    >;

    expect(variants.length).toBeGreaterThan(0);

    for (const [variant, definition] of variants) {
      expect(variant.length).toBeGreaterThan(0);
      expect(definition.fontSize).toBeGreaterThan(0);
      expect(definition.lineHeight).toBeGreaterThanOrEqual(definition.fontSize);
      expect(definition.scaleRole).toBeTruthy();
      expect(definition.maxFontSizeMultiplier).toBe(
        typographyScaleRoleMaxFontSizeMultiplier[definition.scaleRole],
      );
    }
  });

  it('keeps compact and display text bounded more tightly than body copy', () => {
    expect(getTypographyMaxFontSizeMultiplier({ variant: 'amountHero' })).toBe(1.1);
    expect(getTypographyMaxFontSizeMultiplier({ variant: 'control' })).toBe(1.15);
    expect(getTypographyMaxFontSizeMultiplier({ variant: 'body' })).toBe(1.3);
    expect(getTypographyMaxFontSizeMultiplier({ variant: 'caption' })).toBe(1.35);
  });

  it('infers a safe role for legacy styles that still provide fontSize locally', () => {
    expect(inferTypographyScaleRole(44)).toBe('display');
    expect(inferTypographyScaleRole(22)).toBe('title');
    expect(inferTypographyScaleRole(16)).toBe('body');
    expect(inferTypographyScaleRole(10)).toBe('control');
    expect(inferTypographyScaleRole(undefined)).toBe('body');
  });
});
