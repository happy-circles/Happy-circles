import { forwardRef } from 'react';
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

import {
  getTypographyMaxFontSizeMultiplier,
  typographyVariants,
  type TypographyScaleRole,
  type TypographyVariant,
} from '@/lib/typography';
import { darkTheme, lightTheme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export type AppTextRef = NativeText;
export type AppTextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'inverse';

export interface AppTextProps extends Omit<
  TextProps,
  'allowFontScaling' | 'maxFontSizeMultiplier'
> {
  readonly align?: TextStyle['textAlign'];
  readonly color?: string;
  readonly scaleRole?: TypographyScaleRole;
  readonly tone?: AppTextTone;
  readonly variant?: TypographyVariant;
}

export const AppText = forwardRef<AppTextRef, AppTextProps>(function AppText(
  { align, color, scaleRole, style, tone, variant, ...props },
  ref,
) {
  const activeTheme = useAppTheme();
  const variantDefinition = variant ? typographyVariants[variant] : undefined;
  const variantStyle = variantDefinition
    ? {
        fontSize: variantDefinition.fontSize,
        lineHeight: variantDefinition.lineHeight,
      }
    : null;
  const flattenedStyle = StyleSheet.flatten([variantStyle, style]) as TextStyle | undefined;
  const fontSize =
    flattenedStyle && typeof flattenedStyle.fontSize === 'number'
      ? flattenedStyle.fontSize
      : undefined;
  const styleColor =
    flattenedStyle && typeof flattenedStyle.color === 'string' ? flattenedStyle.color : undefined;
  const themedStyleColor = resolveStyleTokenColor(activeTheme, styleColor);

  return (
    <NativeText
      {...props}
      allowFontScaling
      maxFontSizeMultiplier={getTypographyMaxFontSizeMultiplier({
        fontSize,
        scaleRole,
        variant,
      })}
      ref={ref}
      style={[
        { color: activeTheme.colors.text },
        variantStyle,
        style,
        themedStyleColor ? { color: themedStyleColor } : null,
        tone ? { color: resolveTextToneColor(activeTheme, tone) } : null,
        align ? { textAlign: align } : null,
        color ? { color } : null,
      ]}
    />
  );
});

type ColorTokenTheme = typeof lightTheme | typeof darkTheme;
type CategoryPaletteKey = keyof AppTheme['palette']['category'];

function resolveStyleTokenColor(
  activeTheme: AppTheme,
  color: string | undefined,
): string | null {
  if (!color) {
    return null;
  }

  for (const sourceTheme of [lightTheme, darkTheme]) {
    const mappedColor = resolveThemeColorToken(activeTheme, sourceTheme, color);
    if (mappedColor) {
      return mappedColor;
    }
  }

  return null;
}

function resolveThemeColorToken(
  activeTheme: AppTheme,
  sourceTheme: ColorTokenTheme,
  color: string,
): string | null {
  const normalizedColor = normalizeColorValue(color);
  const sourceColors = sourceTheme.colors as Record<string, string>;
  const activeColors = activeTheme.colors as Record<string, string>;

  for (const [tokenName, tokenValue] of Object.entries(sourceColors)) {
    if (normalizeColorValue(tokenValue) === normalizedColor) {
      return activeColors[tokenName] ?? null;
    }
  }

  const sourceCategories = sourceTheme.palette.category;
  const activeCategories = activeTheme.palette.category;
  for (const tokenName of Object.keys(sourceCategories) as CategoryPaletteKey[]) {
    const sourceCategory = sourceCategories[tokenName];
    const activeCategory = activeCategories[tokenName];

    if (normalizeColorValue(sourceCategory.color) === normalizedColor) {
      return activeCategory.color;
    }

    if (normalizeColorValue(sourceCategory.backgroundColor) === normalizedColor) {
      return activeCategory.backgroundColor;
    }
  }

  return null;
}

function normalizeColorValue(color: string): string {
  return color.trim().toLowerCase();
}

function resolveTextToneColor(activeTheme: ReturnType<typeof useAppTheme>, tone: AppTextTone) {
  if (tone === 'muted') {
    return activeTheme.colors.textMuted;
  }

  if (tone === 'subtle') {
    return activeTheme.colors.muted;
  }

  if (tone === 'primary') {
    return activeTheme.colors.primary;
  }

  if (tone === 'success') {
    return activeTheme.colors.success;
  }

  if (tone === 'warning') {
    return activeTheme.colors.warning;
  }

  if (tone === 'danger') {
    return activeTheme.colors.danger;
  }

  if (tone === 'inverse') {
    return activeTheme.colors.white;
  }

  return activeTheme.colors.text;
}
