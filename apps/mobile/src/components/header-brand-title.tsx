import { StyleSheet, Text, View } from 'react-native';

import { HappyCirclesGlyph } from '@/components/happy-circles-glyph';
import { theme } from '@/lib/theme';

export function HeaderBrandTitle({
  logoSize = 34,
  titleSize = theme.typography.largeTitle,
}: {
  readonly logoSize?: number;
  readonly titleSize?: number;
}) {
  return (
    <View accessibilityLabel="Happy Circles" style={styles.root}>
      <HappyCirclesGlyph size={logoSize} />
      <Text numberOfLines={1} style={[styles.title, { fontSize: titleSize }]}>
        Happy Circles
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 40,
  },
  title: {
    color: theme.colors.text,
    flexShrink: 1,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 36,
  },
});
