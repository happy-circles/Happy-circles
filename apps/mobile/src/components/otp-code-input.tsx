import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

interface OtpCodeInputProps {
  readonly disabled?: boolean;
  readonly hasError?: boolean;
  readonly length?: number;
  readonly onChangeText: (value: string) => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly value: string;
}

export function OtpCodeInput({
  disabled = false,
  hasError = false,
  length = 8,
  onChangeText,
  style,
  value,
}: OtpCodeInputProps) {
  const activeTheme = useAppTheme();
  const inputRef = useRef<TextInput | null>(null);
  const [focused, setFocused] = useState(false);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  function handleChangeText(nextValue: string) {
    onChangeText(nextValue.replace(/\D/g, '').slice(0, length));
  }

  return (
    <Pressable
      accessibilityLabel="Código de confirmación"
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
      style={[styles.container, style, disabled ? styles.disabled : null]}
    >
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        caretHidden
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={length}
        onBlur={() => setFocused(false)}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        ref={inputRef}
        style={styles.hiddenInput}
        textContentType="oneTimeCode"
        value={value}
      />
      <View style={styles.boxRow}>
        {digits.map((digit, index) => {
          const active = focused && index === activeIndex;
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  backgroundColor: activeTheme.colors.surfaceSoft,
                  borderColor: hasError
                    ? activeTheme.colors.danger
                    : active
                      ? activeTheme.colors.primary
                      : activeTheme.colors.border,
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <AppText
                scaleRole="control"
                style={[styles.digit, { color: activeTheme.colors.text }]}
              >
                {digit}
              </AppText>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 10,
    width: '100%',
  },
  hiddenInput: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    width: 1,
  },
  boxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    width: '100%',
  },
  box: {
    alignItems: 'center',
    borderRadius: theme.radius.tiny,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: 'center',
    maxWidth: 34,
    minWidth: 24,
  },
  digit: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.58,
  },
});
