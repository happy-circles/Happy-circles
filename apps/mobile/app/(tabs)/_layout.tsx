import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

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
          tabBarItemStyle: styles.tabBarItem,
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
          <Ionicons color={theme.colors.white} name="add" size={22} />
          <Text style={styles.fabLabel}>Registrar</Text>
        </Pressable>
      </Link>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderColor: theme.colors.hairline,
    borderTopWidth: 1,
    bottom: 16,
    height: 78,
    left: 16,
    paddingBottom: 10,
    paddingTop: 10,
    position: 'absolute',
    right: 16,
    borderRadius: theme.radius.xlarge,
    ...theme.shadow.floating,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
  tabBarLabel: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    bottom: 116,
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
