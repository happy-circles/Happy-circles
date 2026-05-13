import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';

export default function TabsLayout() {
  const activeTheme = useAppTheme();
  const { status } = useSession();

  if (status === 'loading') {
    return null;
  }

  if (status === 'signed_out') {
    return <Redirect href="/join?mode=sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: [styles.scene, { backgroundColor: activeTheme.colors.background }],
        tabBarStyle: styles.hiddenTabBar,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: {},
  hiddenTabBar: {
    display: 'none',
  },
});
