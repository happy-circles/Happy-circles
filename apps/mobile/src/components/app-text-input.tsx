import { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput as NativeTextInput,
  type TextInputProps,
} from 'react-native';

import { theme } from '@/lib/theme';
import { typographyScaleRoleMaxFontSizeMultiplier } from '@/lib/typography';
import { useAppTheme } from '@/providers/theme-provider';

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
  const activeTheme = useAppTheme();
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
      cursorColor={activeTheme.colors.primary}
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
      placeholderTextColor={props.placeholderTextColor ?? activeTheme.colors.muted}
      selectionColor={selectionColor ?? activeTheme.colors.primary}
      style={[
        styles.base,
        { color: activeTheme.colors.text },
        styles[density],
        multiline ? styles.multiline : singleLineStyle,
        styles[chrome],
        showsChrome ? themedChromeStyle(activeTheme, chrome) : null,
        showsChrome && focused ? themedFocusedStyle(activeTheme) : null,
        showsChrome && hasError ? { borderColor: activeTheme.colors.danger } : null,
        showsChrome && focused && hasError ? themedFocusedErrorStyle(activeTheme) : null,
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
    borderRadius: theme.radius.medium,
    borderWidth: 1,
  },
  glass: {
    borderRadius: theme.radius.medium,
    borderWidth: 1,
  },
  plain: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  focused: {
    ...Platform.select({ default: { elevation: 2 } }),
  },
});

function themedChromeStyle(activeTheme: ReturnType<typeof useAppTheme>, chrome: InputChrome) {
  if (chrome === 'glass') {
    return {
      backgroundColor: activeTheme.colors.inputGlass,
      borderColor: activeTheme.colors.border,
    };
  }

  if (chrome === 'plain') {
    return null;
  }

  return {
    backgroundColor: activeTheme.colors.surfaceMuted,
    borderColor: activeTheme.colors.border,
  };
}

function themedFocusedStyle(activeTheme: ReturnType<typeof useAppTheme>) {
  return {
    backgroundColor: activeTheme.colors.surface,
    borderColor: activeTheme.colors.primary,
    ...Platform.select({
      web: {
        boxShadow: `0 0 10px ${activeTheme.colors.primaryGhost}`,
      },
      ios: {
        shadowColor: activeTheme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: activeTheme.scheme === 'dark' ? 0.2 : 0.14,
        shadowRadius: 10,
      },
      default: {
        elevation: 2,
      },
    }),
  };
}

function themedFocusedErrorStyle(activeTheme: ReturnType<typeof useAppTheme>) {
  return {
    borderColor: activeTheme.colors.danger,
    ...Platform.select({
      web: {
        boxShadow: `0 0 10px ${activeTheme.colors.dangerSoft}`,
      },
      ios: {
        shadowColor: activeTheme.colors.danger,
        shadowOpacity: activeTheme.scheme === 'dark' ? 0.2 : 0.12,
        shadowRadius: 10,
      },
    }),
  };
}
