import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '@/providers/theme-provider';

export interface AppHeaderBackButtonProps {
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
}

export function AppHeaderBackButton({
  accessibilityLabel = 'Volver',
  onPress,
}: AppHeaderBackButtonProps) {
  const activeTheme = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
    >
      <Ionicons color={activeTheme.colors.text} name="chevron-back" size={24} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.64,
  },
});
