import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';
import type { PersonSegmentKey } from './person-detail-helpers';

export function PersonDetailSegmentTabs({
  onChange,
  visualSegment,
}: {
  readonly onChange: (segment: PersonSegmentKey) => void;
  readonly visualSegment: PersonSegmentKey;
}) {
  const activeTheme = useAppTheme();

  return (
    <View style={[styles.tabBar, { borderBottomColor: activeTheme.colors.hairline }]}>
      <Pressable
        onPress={() => onChange('pending')}
        style={({ pressed }) => [
          styles.tabButton,
          visualSegment === 'pending'
            ? [styles.tabButtonActive, { borderBottomColor: activeTheme.colors.primary }]
            : null,
          pressed ? styles.tabButtonPressed : null,
        ]}
      >
        <AppText
          style={[
            styles.tabLabel,
            { color: activeTheme.colors.textMuted },
            visualSegment === 'pending' ? { color: activeTheme.colors.text } : null,
          ]}
        >
          Pendientes
        </AppText>
      </Pressable>
      <View style={[styles.tabDivider, { backgroundColor: activeTheme.colors.hairline }]} />
      <Pressable
        onPress={() => onChange('history')}
        style={({ pressed }) => [
          styles.tabButton,
          visualSegment === 'history'
            ? [styles.tabButtonActive, { borderBottomColor: activeTheme.colors.primary }]
            : null,
          pressed ? styles.tabButtonPressed : null,
        ]}
      >
        <AppText
          style={[
            styles.tabLabel,
            { color: activeTheme.colors.textMuted },
            visualSegment === 'history' ? { color: activeTheme.colors.text } : null,
          ]}
        >
          Historial
        </AppText>
      </Pressable>
    </View>
  );
}
