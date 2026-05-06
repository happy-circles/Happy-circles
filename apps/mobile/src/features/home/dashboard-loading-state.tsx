import { View } from 'react-native';

import { dashboardStyles as styles } from '@/features/home/dashboard-screen.styles';
import { AppText } from '@/components/app-text';

export function DashboardLoadingState() {
  return (
    <>
      <View style={styles.homeLoadingStack}>
        <View style={styles.homeLoadingHero}>
          <View style={styles.homeLoadingTitleLine} />
          <View style={styles.homeLoadingBodyLine} />
        </View>
        <View style={styles.homeLoadingGrid}>
          <View style={styles.homeLoadingTile} />
          <View style={styles.homeLoadingTile} />
          <View style={styles.homeLoadingTile} />
        </View>
        <View style={styles.homeLoadingList}>
          <View style={styles.homeLoadingListLine} />
          <View style={styles.homeLoadingListLine} />
          <View style={styles.homeLoadingListLineShort} />
        </View>
      </View>
      <AppText style={styles.supportText}>
        Estamos sincronizando el panorama general de tu cuenta.
      </AppText>
    </>
  );
}
