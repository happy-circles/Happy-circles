import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { theme } from '@/lib/theme';

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
  const inputRef = useRef<TextInput | null>(null);
  const [focused, setFocused] = useState(false);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  function handleChangeText(nextValue: string) {
    onChangeText(nextValue.replace(/\D/g, '').slice(0, length));
  }

  return (
    <Pressable
      accessibilityLabel="Codigo de confirmacion"
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
                active ? styles.boxActive : null,
                hasError ? styles.boxError : null,
              ]}
            >
              <Text style={styles.digit}>{digit}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  hiddenInput: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    width: 1,
  },
  boxRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    width: '100%',
  },
  box: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    maxWidth: 44,
    minWidth: 28,
  },
  boxActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  boxError: {
    borderColor: theme.colors.danger,
  },
  digit: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.58,
  },
});
