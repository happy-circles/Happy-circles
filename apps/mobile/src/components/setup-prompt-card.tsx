import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

type SetupKind = 'contacts' | 'notifications';

export interface SetupPromptCardProps {
  readonly busyKind: SetupKind | null;
  readonly needsContacts: boolean;
  readonly needsNotifications: boolean;
  readonly onContactsPress: () => void;
  readonly onNotificationsPress: () => void;
}

interface SetupAction {
  readonly kind: SetupKind;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly loadingLabel: string;
  readonly onPress: () => void;
}

function bodyCopy(needsContacts: boolean, needsNotifications: boolean): string {
  if (needsContacts && needsNotifications) {
    return 'Activa contactos y recordatorios cuando estes listo. No bloquean tu entrada.';
  }

  if (needsContacts) {
    return 'Permite contactos para encontrar personas mas rapido. Puedes seguir sin hacerlo.';
  }

  return 'Activa recordatorios para no dejar pendientes por revisar.';
}

function ActionRow({
  action,
  busyKind,
}: {
  readonly action: SetupAction;
  readonly busyKind: SetupKind | null;
}) {
  const isBusy = busyKind === action.kind;
  const isDisabled = Boolean(busyKind);

  return (
    <Pressable
      disabled={isDisabled}
      onPress={isDisabled ? undefined : action.onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled && !isBusy ? styles.disabled : null,
      ]}
    >
      <View style={styles.actionIcon}>
        <Ionicons color={theme.colors.textMuted} name={action.icon} size={18} />
      </View>
      <Text style={styles.actionLabel}>{isBusy ? action.loadingLabel : action.label}</Text>
      {isBusy ? (
        <ActivityIndicator color={theme.colors.textMuted} size="small" />
      ) : (
        <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
      )}
    </Pressable>
  );
}

export function SetupPromptCard({
  busyKind,
  needsContacts,
  needsNotifications,
  onContactsPress,
  onNotificationsPress,
}: SetupPromptCardProps) {
  const actions: SetupAction[] = [];

  if (needsContacts) {
    actions.push({
      kind: 'contacts',
      icon: 'people-outline',
      label: 'Permitir contactos',
      loadingLabel: 'Pidiendo permiso...',
      onPress: onContactsPress,
    });
  }

  if (needsNotifications) {
    actions.push({
      kind: 'notifications',
      icon: 'notifications-outline',
      label: 'Activar recordatorios',
      loadingLabel: 'Activando...',
      onPress: onNotificationsPress,
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconHalo}>
          <Ionicons
            color={theme.colors.success}
            name={needsNotifications ? 'notifications-outline' : 'people-outline'}
            size={20}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Termina los ajustes de la app</Text>
          <Text style={styles.body}>{bodyCopy(needsContacts, needsNotifications)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {actions.map((action, index) => (
          <View key={action.kind} style={index > 0 ? styles.actionDivider : null}>
            <ActionRow action={action} busyKind={busyKind} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  iconHalo: {
    alignItems: 'center',
    backgroundColor: theme.colors.successSoft,
    borderRadius: theme.radius.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 19,
  },
  body: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  actions: {
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionDivider: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 48,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  actionLabel: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.68,
  },
  disabled: {
    opacity: 0.48,
  },
});
