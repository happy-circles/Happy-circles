import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { useAppTheme } from '@/providers/theme-provider';
import { activityScreenStyles as styles } from './activity-screen.styles';

interface ActivitySheetStatusProps {
  readonly loading?: boolean;
  readonly message: string;
  readonly onClose: () => void;
}

export function ActivitySheetStatus({
  loading = false,
  message,
  onClose,
}: ActivitySheetStatusProps) {
  const activeTheme = useAppTheme();

  return (
    <View style={[styles.loadingState, { backgroundColor: activeTheme.colors.surface }]}>
      <View style={styles.loadingStateContent}>
        <View style={styles.heroRow}>
          <AppText style={styles.heroTitle}>Notificaciones</AppText>
          <Pressable
            accessibilityLabel="Cerrar notificaciones"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.tabButtonPressed : null,
            ]}
          >
            <Ionicons color={activeTheme.colors.text} name="close" size={22} />
          </Pressable>
        </View>
        <View style={styles.loadingStateBody}>
          {loading ? (
            <View style={styles.loadingMotion}>
              <HappyCirclesMotion size={108} variant="loading" />
            </View>
          ) : null}
          <AppText style={styles.supportText}>{message}</AppText>
        </View>
      </View>
    </View>
  );
}
