import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';

type HappyFacesCounterProps = {
  closedCircleCount: number;
  compact?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  totalFaces: number;
};

function compactFacesLabel(count: number) {
  return count > 999 ? '999+' : String(count);
}

export function HappyFacesCounter({
  closedCircleCount,
  compact = false,
  onPress,
  style,
  totalFaces,
}: HappyFacesCounterProps) {
  const hasFaces = totalFaces > 0 || closedCircleCount > 0;
  const faceLabel = compactFacesLabel(totalFaces);

  return (
    <Pressable
      accessibilityLabel={`${faceLabel} caritas felices acumuladas`}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        compact ? styles.compact : null,
        hasFaces ? styles.active : null,
        pressed && onPress ? styles.pressed : null,
        style,
      ]}
    >
      <Ionicons
        color={hasFaces ? theme.colors.warning : theme.colors.muted}
        name={hasFaces ? 'happy' : 'happy-outline'}
        size={compact ? 17 : 18}
      />
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[styles.text, hasFaces ? styles.textActive : null]}
      >
        {faceLabel}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 38,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 9,
  },
  compact: {
    minWidth: 60,
    paddingHorizontal: 7,
  },
  active: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: 'rgba(249, 115, 22, 0.18)',
  },
  pressed: {
    opacity: 0.68,
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 16,
  },
  textActive: {
    color: theme.colors.text,
  },
});
