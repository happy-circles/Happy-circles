import { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput as NativeTextInput,
  type TextInputProps,
} from 'react-native';

import { theme } from '@/lib/theme';
import { typographyScaleRoleMaxFontSizeMultiplier } from '@/lib/typography';

type InputChrome = 'default' | 'glass' | 'plain';
type InputDensity = 'compact' | 'identity' | 'regular';

export type AppTextInputRef = NativeTextInput;

export interface AppTextInputProps extends Omit<
  TextInputProps,
  'allowFontScaling' | 'maxFontSizeMultiplier'
> {
  readonly chrome?: InputChrome;
  readonly density?: InputDensity;
  readonly hasError?: boolean;
}

export const AppTextInput = forwardRef<AppTextInputRef, AppTextInputProps>(function AppTextInput(
  {
    chrome = 'default',
    density = 'regular',
    hasError = false,
    multiline = false,
    onBlur,
    onFocus,
    selectionColor,
    style,
    ...props
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const showsChrome = chrome !== 'plain';
  const singleLineStyle =
    density === 'compact'
      ? styles.compactSingleLine
      : density === 'identity'
        ? styles.identitySingleLine
        : styles.regularSingleLine;

  return (
    <NativeTextInput
      {...props}
      allowFontScaling
      cursorColor={theme.colors.primary}
      maxFontSizeMultiplier={typographyScaleRoleMaxFontSizeMultiplier.input}
      multiline={multiline}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      ref={ref}
      selectionColor={selectionColor ?? theme.colors.primary}
      style={[
        styles.base,
        styles[density],
        multiline ? styles.multiline : singleLineStyle,
        styles[chrome],
        showsChrome && focused ? styles.focused : null,
        showsChrome && hasError ? styles.error : null,
        showsChrome && focused && hasError ? styles.focusedError : null,
        style,
      ]}
    />
  );
});

export function getCurrentlyFocusedTextInput() {
  return NativeTextInput.State.currentlyFocusedInput();
}

const styles = StyleSheet.create({
  base: {
    color: theme.colors.text,
    includeFontPadding: false,
  },
  regular: {
    fontSize: theme.typography.body,
    lineHeight: 20,
    paddingHorizontal: theme.spacing.md,
  },
  compact: {
    fontSize: theme.typography.callout,
    lineHeight: 18,
    paddingHorizontal: theme.spacing.md,
  },
  identity: {
    fontSize: theme.typography.body,
    lineHeight: 20,
    paddingHorizontal: theme.spacing.md,
  },
  regularSingleLine: {
    height: 52,
    minHeight: 52,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  compactSingleLine: {
    height: 48,
    minHeight: 48,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  identitySingleLine: {
    height: 56,
    minHeight: 56,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  multiline: {
    minHeight: 96,
    paddingVertical: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  default: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(15, 23, 40, 0.08)',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
  },
  plain: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  focused: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 0 10px rgba(26, 39, 68, 0.14)',
      },
      ios: {
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      default: {
        elevation: 2,
      },
    }),
  },
  error: {
    borderColor: theme.colors.danger,
  },
  focusedError: {
    borderColor: theme.colors.danger,
    ...Platform.select({
      web: {
        boxShadow: '0 0 10px rgba(232, 96, 74, 0.12)',
      },
      ios: {
        shadowColor: theme.colors.danger,
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
    }),
  },
});
