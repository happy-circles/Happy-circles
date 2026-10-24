import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import { normalizeOtpCode } from './otp-code-input.helpers';

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
  const [focused, setFocused] = useState(false);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  function handleChangeText(nextValue: string) {
    onChangeText(normalizeOtpCode(nextValue, length));
  }

  return (
    <View style={[styles.container, style, disabled ? styles.disabled : null]}>
      <View style={styles.inputArea}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.boxRow}
        >
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
        <TextInput
          accessibilityLabel="Código de confirmación"
          accessibilityState={{ disabled }}
          autoCapitalize="none"
          autoComplete={Platform.OS === 'ios' ? undefined : 'one-time-code'}
          autoCorrect={false}
          contextMenuHidden={false}
          editable={!disabled}
          keyboardType="number-pad"
          onBlur={() => setFocused(false)}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          selectTextOnFocus
          selectionColor={activeTheme.colors.primary}
          style={styles.inputOverlay}
          textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
          underlineColorAndroid="transparent"
          value={value}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputArea: {
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 10,
    width: '100%',
  },
  inputOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    color: 'transparent',
    fontSize: 18,
    padding: 0,
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
