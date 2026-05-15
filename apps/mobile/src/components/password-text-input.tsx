import { forwardRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  AppTextInput,
  type AppTextInputProps,
  type AppTextInputRef,
} from '@/components/app-text-input';
import { useAppTheme } from '@/providers/theme-provider';

export interface PasswordTextInputProps extends Omit<AppTextInputProps, 'secureTextEntry'> {
  readonly containerStyle?: StyleProp<ViewStyle>;
}

export const PasswordTextInput = forwardRef<AppTextInputRef, PasswordTextInputProps>(
  function PasswordTextInput({ containerStyle, style, ...props }, ref) {
    const activeTheme = useAppTheme();
    const [passwordVisible, setPasswordVisible] = useState(false);

    return (
      <View style={[styles.container, containerStyle]}>
        <AppTextInput
          {...props}
          ref={ref}
          secureTextEntry={!passwordVisible}
          style={[style, styles.inputWithToggle]}
        />
        <Pressable
          accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          accessibilityRole="button"
          accessibilityState={{ selected: passwordVisible }}
          hitSlop={8}
          onPress={() => setPasswordVisible((visible) => !visible)}
          style={({ pressed }) => [styles.toggleButton, pressed ? styles.togglePressed : null]}
        >
          <Ionicons
            color={activeTheme.colors.textMuted}
            name={passwordVisible ? 'eye-off' : 'eye'}
            size={20}
          />
        </Pressable>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  inputWithToggle: {
    paddingRight: 52,
  },
  toggleButton: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 48,
  },
  togglePressed: {
    opacity: 0.72,
  },
});
