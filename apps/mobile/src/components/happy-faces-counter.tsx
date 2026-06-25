import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { HappyCirclesCenterSvg } from '@/components/happy-circles-glyph';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export const HAPPY_FACES_TREASURE_GOLD = theme.colors.treasure;

const HAPPY_FACES_TREASURE_SOFT = theme.colors.treasureSoft;
const HAPPY_FACE_VIEW_BOX = '290 290 100 100';

type HappyFacesCounterProps = {
  closedCircleCount: number;
  compact?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: string;
  totalFaces: number;
  variant?: 'default' | 'reward';
};

function compactFacesLabel(count: number) {
  return count > 999 ? '999+' : String(count);
}

export function HappyFacesCounter({
  closedCircleCount,
  compact = false,
  onPress,
  style,
  tone = HAPPY_FACES_TREASURE_GOLD,
  totalFaces,
  variant = 'default',
}: HappyFacesCounterProps) {
  const activeTheme = useAppTheme();
  const hasFaces = totalFaces > 0 || closedCircleCount > 0;
  const faceLabel = compactFacesLabel(totalFaces);
  const isReward = variant === 'reward';
  const faceColor = isReward || hasFaces ? tone : activeTheme.colors.muted;
  const faceSize = isReward ? 23 : compact ? 17 : 18;
  const facePalette = {
    navy: faceColor,
    green: faceColor,
    coral: faceColor,
    face: faceColor,
    faceDetail: activeTheme.colors.white,
  };
  const surfaceStyle = {
    backgroundColor: isReward ? activeTheme.colors.treasureSoft : activeTheme.colors.surface,
    borderColor: activeTheme.colors.hairline,
  };

  return (
    <Pressable
      accessibilityLabel={`${faceLabel} caritas felices acumuladas`}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        compact ? styles.compact : null,
        hasFaces ? styles.active : null,
        isReward ? styles.reward : null,
        surfaceStyle,
        pressed && onPress ? styles.pressed : null,
        style,
      ]}
    >
      {isReward || hasFaces ? (
        <HappyCirclesCenterSvg
          palette={facePalette}
          size={faceSize}
          viewBox={HAPPY_FACE_VIEW_BOX}
        />
      ) : (
        <Ionicons color={faceColor} name="happy-outline" size={faceSize} />
      )}
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[
          styles.text,
          { color: hasFaces ? activeTheme.colors.text : activeTheme.colors.textMuted },
          hasFaces ? styles.textActive : null,
          isReward ? styles.textReward : null,
          isReward ? styles.textRewardActive : null,
          isReward ? { color: tone } : null,
        ]}
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
    overflow: 'visible',
    paddingHorizontal: 9,
  },
  compact: {
    minWidth: 60,
    paddingHorizontal: 7,
  },
  active: {
    backgroundColor: theme.colors.surface,
  },
  reward: {
    gap: 7,
    height: 48,
    minWidth: 92,
    paddingHorizontal: 14,
    backgroundColor: HAPPY_FACES_TREASURE_SOFT,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.95 }],
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
  textReward: {
    fontSize: 17,
    lineHeight: 20,
  },
  textRewardActive: {
    color: HAPPY_FACES_TREASURE_GOLD,
  },
});
