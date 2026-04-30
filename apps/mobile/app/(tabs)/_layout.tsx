import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/lib/theme';
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
    <>
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

      <Link href="/register" asChild>
        <Pressable style={styles.fab}>
          <Ionicons color={theme.colors.white} name="add" size={22} />
          <Text style={styles.fabLabel}>Registrar</Text>
        </Pressable>
      </Link>
    </>
  );
}

const styles = StyleSheet.create({
  hiddenTabBar: {
    display: 'none',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    bottom: 28,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 14,
    position: 'absolute',
    right: theme.spacing.lg,
    ...theme.shadow.floating,
  },
  fabLabel: {
    color: theme.colors.white,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
});
