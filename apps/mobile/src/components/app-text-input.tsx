import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { theme } from '@/lib/theme';

type InputChrome = 'default' | 'glass';

export interface AppTextInputProps extends TextInputProps {
  readonly chrome?: InputChrome;
  readonly hasError?: boolean;
}

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  { chrome = 'default', hasError = false, onBlur, onFocus, selectionColor, style, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      cursorColor={theme.colors.primary}
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
        chrome === 'glass' ? styles.glass : styles.default,
        focused ? styles.focused : null,
        hasError ? styles.error : null,
        focused && hasError ? styles.focusedError : null,
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  default: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(15, 23, 40, 0.08)',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 54,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
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
