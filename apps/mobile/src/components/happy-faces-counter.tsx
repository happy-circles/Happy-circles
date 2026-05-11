import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';

export const HAPPY_FACES_TREASURE_GOLD = '#f5a400';

const HAPPY_FACES_TREASURE_SOFT = '#fff4ce';

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
  const hasFaces = totalFaces > 0 || closedCircleCount > 0;
  const faceLabel = compactFacesLabel(totalFaces);
  const isReward = variant === 'reward';

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
        pressed && onPress ? styles.pressed : null,
        style,
      ]}
    >
      {isReward && hasFaces ? (
        <View pointerEvents="none" style={styles.rewardSpark}>
          <Ionicons color={tone} name="sparkles" size={10} />
        </View>
      ) : null}
      <Ionicons
        color={isReward || hasFaces ? tone : theme.colors.muted}
        name={isReward || hasFaces ? 'happy' : 'happy-outline'}
        size={isReward ? 23 : compact ? 17 : 18}
      />
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[
          styles.text,
          hasFaces ? styles.textActive : null,
          isReward ? styles.textReward : null,
          isReward ? styles.textRewardActive : null,
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
  rewardSpark: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: -3,
    top: -8,
    zIndex: 2,
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
