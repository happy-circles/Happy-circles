import { Text, View } from 'react-native';

import { dashboardStyles as styles } from '@/features/home/dashboard-screen.styles';

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
      <Text style={styles.supportText}>
        Estamos sincronizando el panorama general de tu cuenta.
      </Text>
    </>
  );
}
