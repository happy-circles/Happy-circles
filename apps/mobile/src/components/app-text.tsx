import { forwardRef } from 'react';
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

import { theme } from '@/lib/theme';
import {
  getTypographyMaxFontSizeMultiplier,
  typographyVariants,
  type TypographyScaleRole,
  type TypographyVariant,
} from '@/lib/typography';

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
  const variantDefinition = variant ? typographyVariants[variant] : undefined;
  const variantStyle = variantDefinition
    ? {
        fontSize: variantDefinition.fontSize,
        lineHeight: variantDefinition.lineHeight,
      }
    : null;
  const flattenedStyle = StyleSheet.flatten([variantStyle, style]);
  const fontSize =
    flattenedStyle && typeof flattenedStyle.fontSize === 'number'
      ? flattenedStyle.fontSize
      : undefined;

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
        variantStyle,
        tone ? textToneStyles[tone] : null,
        align ? { textAlign: align } : null,
        color ? { color } : null,
        style,
      ]}
    />
  );
});

const textToneStyles = StyleSheet.create({
  default: {
    color: theme.colors.text,
  },
  muted: {
    color: theme.colors.textMuted,
  },
  subtle: {
    color: theme.colors.muted,
  },
  primary: {
    color: theme.colors.primary,
  },
  success: {
    color: theme.colors.success,
  },
  warning: {
    color: theme.colors.warning,
  },
  danger: {
    color: theme.colors.danger,
  },
  inverse: {
    color: theme.colors.white,
  },
});
