import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Platform,
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
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const pasteEnabledRef = useRef(!disabled);
  const pasteInFlightRef = useRef(false);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, length - 1);
  const pasteDisabled = disabled || pasteBusy;
  const nativePasteAvailable = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;

  useEffect(() => {
    pasteEnabledRef.current = !disabled;
    return () => {
      pasteEnabledRef.current = false;
    };
  }, [disabled]);

  function handleChangeText(nextValue: string) {
    setPasteError(null);
    onChangeText(normalizeOtpCode(nextValue, length));
  }

  function applyPastedText(text: string) {
    if (!pasteEnabledRef.current) {
      return;
    }

    const code = normalizeOtpCode(text, length);
    if (!code) {
      setPasteError('Copia el código del correo y vuelve a pegarlo.');
      return;
    }

    setPasteError(null);
    onChangeText(code);
  }

  async function handlePastePress() {
    if (!pasteEnabledRef.current || pasteInFlightRef.current) {
      return;
    }

    pasteInFlightRef.current = true;
    setPasteBusy(true);
    setPasteError(null);
    try {
      const text = await Clipboard.getStringAsync();
      applyPastedText(text);
    } catch {
      if (pasteEnabledRef.current) {
        setPasteError('No pudimos pegar el código. Intenta pegarlo directamente en el campo.');
      }
    } finally {
      pasteInFlightRef.current = false;
      setPasteBusy(false);
    }
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
      <View
        pointerEvents={pasteDisabled ? 'none' : 'auto'}
        style={[styles.pasteAction, pasteDisabled ? styles.disabled : null]}
      >
        {nativePasteAvailable ? (
          <Clipboard.ClipboardPasteButton
            acceptedContentTypes={['plain-text']}
            accessibilityHint="Reemplaza el código con el texto copiado."
            accessibilityState={{ disabled: pasteDisabled }}
            backgroundColor={activeTheme.colors.primary}
            cornerStyle="capsule"
            foregroundColor={activeTheme.colors.onPrimary}
            onPress={(data) => {
              if (data.type === 'text') {
                applyPastedText(data.text);
              }
            }}
            style={styles.nativePasteButton}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: pasteBusy, disabled: pasteDisabled }}
            disabled={pasteDisabled}
            onPress={() => void handlePastePress()}
            style={({ pressed }) => [
              styles.pasteButton,
              { borderColor: activeTheme.colors.border },
              pressed ? styles.pressed : null,
            ]}
          >
            <AppText scaleRole="control" style={styles.pasteButtonText}>
              {pasteBusy ? 'Pegando...' : 'Pegar código'}
            </AppText>
          </Pressable>
        )}
      </View>
      {pasteError ? (
        <AppText accessibilityLiveRegion="polite" style={styles.pasteError} tone="danger">
          {pasteError}
        </AppText>
      ) : null}
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
  pasteAction: {
    alignSelf: 'center',
    marginTop: 6,
  },
  nativePasteButton: {
    height: 44,
    width: 136,
  },
  pasteButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
  },
  pasteButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  pasteError: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.76,
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
