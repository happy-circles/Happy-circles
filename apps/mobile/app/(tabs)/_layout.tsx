import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useSession } from '@/providers/session-provider';

export default function TabsLayout() {
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
  hiddenTabBar: {
    display: 'none',
  },
});
