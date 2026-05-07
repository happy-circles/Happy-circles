import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export interface SwipePagerProps<T extends string> {
  readonly accessibilityLabel?: string;
  readonly onChange: (value: T) => void;
  readonly onInteractionStateChange?: (isInteracting: boolean) => void;
  readonly onPreviewChange?: (value: T) => void;
  readonly pageStyle?: StyleProp<ViewStyle>;
  readonly renderPage: (value: T, index: number) => ReactNode;
  readonly scrollEnabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly value: T;
  readonly values: readonly T[];
}

function clampIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), Math.max(maxIndex, 0));
}

export function SwipePager<T extends string>({
  accessibilityLabel,
  onInteractionStateChange,
  onPreviewChange,
  pageStyle,
  renderPage,
  style,
  value,
  values,
}: SwipePagerProps<T>) {
  const activeIndex = clampIndex(values.indexOf(value), values.length - 1);
  const activeValue = values[activeIndex];

  useEffect(() => {
    onInteractionStateChange?.(false);
  }, [onInteractionStateChange]);

  useEffect(() => {
    if (activeValue) {
      onPreviewChange?.(activeValue);
    }
  }, [activeValue, onPreviewChange]);

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.root, style]}>
      {activeValue ? (
        <View style={[styles.page, pageStyle]}>{renderPage(activeValue, activeIndex)}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  page: {
    flex: 1,
  },
});
