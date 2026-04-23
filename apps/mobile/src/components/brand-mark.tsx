import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { HappyCirclesGlyph } from '@/components/happy-circles-glyph';
import { theme } from '@/lib/theme';

type BrandMarkSize = 'sm' | 'md' | 'lg';
type BrandMarkOrientation = 'horizontal' | 'stacked';
type BrandMarkTone = 'brand' | 'mono';

const SIZE_CONFIG = {
  sm: {
    glyph: 52,
    title: theme.typography.callout,
    subtitle: theme.typography.caption,
  },
  md: {
    glyph: 74,
    title: theme.typography.title3,
    subtitle: theme.typography.caption,
  },
  lg: {
    glyph: 132,
    title: 34,
    subtitle: theme.typography.callout,
  },
} as const;

export interface BrandMarkProps {
  readonly size?: BrandMarkSize;
  readonly orientation?: BrandMarkOrientation;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: BrandMarkTone;
}

export function BrandMark({
  size = 'md',
  orientation = 'horizontal',
  style,
  tone = 'brand',
}: BrandMarkProps) {
  const config = SIZE_CONFIG[size];
  const isStacked = orientation === 'stacked';
  const titleColor = tone === 'mono' ? theme.colors.text : theme.colors.brandNavy;
  const subtitleColor = tone === 'mono' ? theme.colors.textMuted : theme.colors.textMuted;

  return (
    <View style={[styles.row, isStacked ? styles.rowStacked : null, style]}>
      <HappyCirclesGlyph
        color={titleColor}
        size={config.glyph}
        tone={tone === 'mono' ? 'mono' : 'brand'}
      />

      <View style={[styles.copy, isStacked ? styles.copyStacked : null]}>
        <Text
          style={[
            styles.title,
            { color: titleColor, fontSize: config.title },
            size === 'lg' ? styles.titleLarge : null,
            isStacked ? styles.titleStacked : null,
          ]}
        >
          Happy Circles
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: subtitleColor, fontSize: config.subtitle },
            isStacked ? styles.subtitleStacked : null,
          ]}
        >
          tu app de finanzas entre amigos
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowStacked: {
    flexDirection: 'column',
    gap: theme.spacing.lg,
    justifyContent: 'center',
  },
  copy: {
    gap: 2,
  },
  copyStacked: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontWeight: '800',
    letterSpacing: 0,
  },
  titleLarge: {
    lineHeight: 40,
  },
  titleStacked: {
    textAlign: 'center',
  },
  subtitle: {
    fontWeight: '600',
    letterSpacing: 0,
  },
  subtitleStacked: {
    textAlign: 'center',
  },
});
