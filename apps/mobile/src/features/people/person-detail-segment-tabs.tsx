import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';
import type { PersonSegmentKey } from './person-detail-helpers';

export function PersonDetailSegmentTabs({
  onChange,
  visualSegment,
}: {
  readonly onChange: (segment: PersonSegmentKey) => void;
  readonly visualSegment: PersonSegmentKey;
}) {
  return (
    <View style={styles.tabBar}>
      <Pressable
        onPress={() => onChange('pending')}
        style={({ pressed }) => [
          styles.tabButton,
          visualSegment === 'pending' ? styles.tabButtonActive : null,
          pressed ? styles.tabButtonPressed : null,
        ]}
      >
        <AppText
          style={[styles.tabLabel, visualSegment === 'pending' ? styles.tabLabelActive : null]}
        >
          Pendientes
        </AppText>
      </Pressable>
      <View style={styles.tabDivider} />
      <Pressable
        onPress={() => onChange('history')}
        style={({ pressed }) => [
          styles.tabButton,
          visualSegment === 'history' ? styles.tabButtonActive : null,
          pressed ? styles.tabButtonPressed : null,
        ]}
      >
        <AppText
          style={[styles.tabLabel, visualSegment === 'history' ? styles.tabLabelActive : null]}
        >
          Historial
        </AppText>
      </Pressable>
    </View>
  );
}
