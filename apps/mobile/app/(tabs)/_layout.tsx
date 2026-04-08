import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

function TabIcon({
  color,
  focused,
  name,
  selectedName,
}: {
  readonly color: string;
  readonly focused: boolean;
  readonly name: keyof typeof Ionicons.glyphMap;
  readonly selectedName: keyof typeof Ionicons.glyphMap;
}) {
  return <Ionicons color={color} name={focused ? selectedName : name} size={20} />;
}

export default function TabsLayout() {
  const { status } = useSession();
  const snapshotQuery = useAppSnapshot();
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;

  if (status === 'loading') {
    return null;
  }

  if (status === 'signed_out') {
    return <Redirect href="/sign-in" />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.muted,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon color={color} focused={focused} name="home-outline" selectedName="home" />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: 'Actividad',
            tabBarBadge: pendingCount || undefined,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                color={color}
                focused={focused}
                name="notifications-outline"
                selectedName="notifications"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                color={color}
                focused={focused}
                name="person-circle-outline"
                selectedName="person-circle"
              />
            ),
          }}
        />
      </Tabs>

      <Link href="/register" asChild>
        <Pressable style={styles.fab}>
          <Ionicons color={theme.colors.white} name="add" size={24} />
          <Text style={styles.fabLabel}>Nuevo</Text>
        </Pressable>
      </Link>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.elevated,
    borderTopColor: theme.colors.hairline,
    height: 88,
    paddingBottom: 24,
    paddingTop: 10,
  },
  tabBarLabel: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    bottom: 96,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
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
