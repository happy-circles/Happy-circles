import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';

const NOTIFICATION_BUTTON_SIZE = 48;
const NOTIFICATION_ICON_SIZE = 24;

export interface NotificationBellButtonProps {
  readonly count: number;
  readonly href: Href;
}

function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function NotificationBellButton({ count, href }: NotificationBellButtonProps) {
  const hasUnread = count > 0;

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityLabel={
          hasUnread ? `${badgeLabel(count)} notificaciones pendientes` : 'Notificaciones'
        }
        style={({ pressed }) => [
          styles.button,
          hasUnread ? styles.buttonActive : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Ionicons
          color={hasUnread ? theme.colors.primary : theme.colors.text}
          name={hasUnread ? 'notifications' : 'notifications-outline'}
          size={NOTIFICATION_ICON_SIZE}
        />
        {hasUnread ? (
          <View style={styles.badge}>
            <AppText style={styles.badgeText}>{badgeLabel(count)}</AppText>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: NOTIFICATION_BUTTON_SIZE,
    justifyContent: 'center',
    position: 'relative',
    width: NOTIFICATION_BUTTON_SIZE,
    ...theme.shadow.card,
  },
  buttonActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: 'rgba(20, 30, 51, 0.12)',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 19,
    justifyContent: 'center',
    minWidth: 19,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  pressed: {
    opacity: 0.68,
  },
});
