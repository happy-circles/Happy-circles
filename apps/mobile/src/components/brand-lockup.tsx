import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Animated, StyleSheet, Text } from 'react-native';

import { HappyCirclesGlyph } from '@/components/happy-circles-glyph';
import { theme } from '@/lib/theme';

type LockupViewStyle = StyleProp<ViewStyle> | object | readonly unknown[];

export const HEADER_BRAND_GAP = 6;
export const HEADER_BRAND_LOGO_SIZE = 68;
export const HEADER_BRAND_TITLE_LINE_HEIGHT = 36;
export const HEADER_BRAND_TITLE_SIZE = 30;
export const HEADER_BRAND_TITLE_WIDTH = 204;

export function BrandLockup({
  accessibilityLabel = 'Happy Circles',
  gap = HEADER_BRAND_GAP,
  logo,
  logoSize = 34,
  logoStyle,
  style,
  title = 'Happy Circles',
  titleContainerStyle,
  titleLineHeight = HEADER_BRAND_TITLE_LINE_HEIGHT,
  titleSize = theme.typography.largeTitle,
  titleStyle,
}: {
  readonly accessibilityLabel?: string;
  readonly gap?: number;
  readonly logo?: ReactNode;
  readonly logoSize?: number;
  readonly logoStyle?: LockupViewStyle;
  readonly style?: LockupViewStyle;
  readonly title?: string;
  readonly titleContainerStyle?: LockupViewStyle;
  readonly titleLineHeight?: number;
  readonly titleSize?: number;
  readonly titleStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, { gap }, style as never]}
    >
      <Animated.View style={[{ height: logoSize, width: logoSize }, logoStyle as never]}>
        {logo ?? <HappyCirclesGlyph size={logoSize} />}
      </Animated.View>
      <Animated.View style={[styles.titleContainer, titleContainerStyle as never]}>
        <Text
          numberOfLines={1}
          style={[styles.title, { fontSize: titleSize, lineHeight: titleLineHeight }, titleStyle]}
        >
          {title}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 40,
  },
  titleContainer: {
    flexShrink: 1,
  },
  title: {
    color: theme.colors.text,
    flexShrink: 1,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
