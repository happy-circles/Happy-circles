import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { PrimaryAction, type PrimaryActionProps } from '@/components/primary-action';
import { theme } from '@/lib/theme';

interface ScreenFinalActionProps
  extends Pick<PrimaryActionProps, 'disabled' | 'icon' | 'label' | 'loading' | 'onPress'> {
  readonly anchored?: boolean;
  readonly bottomPadding?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export function ScreenFinalAction({
  anchored = true,
  bottomPadding = true,
  disabled,
  icon = 'checkmark',
  label,
  loading,
  onPress,
  style,
}: ScreenFinalActionProps) {
  return (
    <View
      style={[
        styles.row,
        anchored ? styles.anchored : null,
        bottomPadding ? styles.bottomPadding : null,
        style,
      ]}
    >
      <PrimaryAction
        compact
        disabled={disabled}
        fullWidth={false}
        icon={icon}
        label={label}
        loading={loading}
        onPress={onPress}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
    paddingTop: theme.spacing.lg,
  },
  anchored: {
    marginTop: 'auto',
  },
  bottomPadding: {
    paddingBottom: theme.spacing.lg,
  },
  action: {
    borderRadius: theme.radius.pill,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    width: 176,
  },
});
