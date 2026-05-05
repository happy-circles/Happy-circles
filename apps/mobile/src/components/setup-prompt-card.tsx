import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';
import { SurfaceCard } from './surface-card';

type SetupKind =
  | 'appleAuth'
  | 'biometrics'
  | 'contacts'
  | 'deviceTrust'
  | 'googleAuth'
  | 'notifications'
  | 'passwordAuth';
type SetupTone = 'critical' | 'recommended';

export interface SetupPromptCardProps {
  readonly biometricLabel?: string;
  readonly busyKind: SetupKind | null;
  readonly dismissible?: boolean;
  readonly needsAppleAuth?: boolean;
  readonly needsBiometrics?: boolean;
  readonly needsContacts: boolean;
  readonly needsDeviceTrust?: boolean;
  readonly needsGoogleAuth?: boolean;
  readonly needsNotifications: boolean;
  readonly needsPasswordAuth?: boolean;
  readonly onAppleAuthPress?: () => void;
  readonly onBiometricsPress?: () => void;
  readonly onContactsPress: () => void;
  readonly onDeviceTrustPress?: () => void;
  readonly onDismiss: () => void;
  readonly onGoogleAuthPress?: () => void;
  readonly onNotificationsPress: () => void;
  readonly onPasswordAuthPress?: () => void;
}

interface SetupAction {
  readonly actionLabel: string;
  readonly description: string;
  readonly kind: SetupKind;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly loadingLabel: string;
  readonly onPress: () => void;
  readonly statusLabel: string;
  readonly title: string;
  readonly tone: SetupTone;
}

function summaryCopy(actionCount: number): string {
  if (actionCount === 1) {
    return 'Hay un ajuste pendiente para dejar tu cuenta lista.';
  }

  return `Hay ${actionCount} ajustes pendientes para completar seguridad, acceso y avisos.`;
}

function resolveToneColor(tone: SetupTone) {
  return tone === 'critical' ? theme.colors.warning : theme.colors.primary;
}

function resolveToneBackground(tone: SetupTone) {
  return tone === 'critical' ? theme.colors.warningSoft : theme.colors.primaryGhost;
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
  const toneColor = resolveToneColor(action.tone);
  const toneBackground = resolveToneBackground(action.tone);

  return (
    <Pressable
      accessibilityLabel={`${action.title}. ${action.description}`}
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={isDisabled ? undefined : action.onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled && !isBusy ? styles.disabled : null,
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: toneBackground }]}>
        <Ionicons color={toneColor} name={action.icon} size={19} />
      </View>
      <View style={styles.actionCopy}>
        <View style={styles.actionTitleRow}>
          <Text style={styles.actionTitle}>{action.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: toneBackground }]}>
            <Text style={[styles.statusBadgeText, { color: toneColor }]}>
              {action.statusLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.actionDescription}>{action.description}</Text>
      </View>
      {isBusy ? (
        <View style={styles.actionBusy}>
          <HappyCirclesMotion size={30} style={styles.actionMotion} variant="loading" />
          <Text style={styles.loadingLabel}>{action.loadingLabel}</Text>
        </View>
      ) : (
        <View style={styles.actionCta}>
          <Text style={styles.actionCtaText}>{action.actionLabel}</Text>
          <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
        </View>
      )}
    </Pressable>
  );
}

export function SetupPromptCard({
  biometricLabel = 'biometria',
  busyKind,
  dismissible = true,
  needsAppleAuth = false,
  needsBiometrics = false,
  needsContacts,
  needsDeviceTrust = false,
  needsGoogleAuth = false,
  needsNotifications,
  needsPasswordAuth = false,
  onAppleAuthPress,
  onBiometricsPress,
  onContactsPress,
  onDeviceTrustPress,
  onDismiss,
  onGoogleAuthPress,
  onNotificationsPress,
  onPasswordAuthPress,
}: SetupPromptCardProps) {
  const actions: SetupAction[] = [];

  if (needsDeviceTrust && onDeviceTrustPress) {
    actions.push({
      kind: 'deviceTrust',
      actionLabel: 'Validar',
      description: 'Autoriza este telefono para cambios sensibles y revisiones de cuenta.',
      icon: 'shield-checkmark-outline',
      loadingLabel: 'Abriendo Perfil...',
      onPress: onDeviceTrustPress,
      statusLabel: 'Prioritario',
      title: 'Dispositivo confiable',
      tone: 'critical',
    });
  }

  if (needsBiometrics && onBiometricsPress) {
    actions.push({
      kind: 'biometrics',
      actionLabel: 'Activar',
      description: `Usa ${biometricLabel} para abrir la app y confirmar acciones protegidas.`,
      icon: 'finger-print',
      loadingLabel: 'Abriendo Perfil...',
      onPress: onBiometricsPress,
      statusLabel: 'Seguridad',
      title: 'Biometria',
      tone: 'critical',
    });
  }

  if (needsPasswordAuth && onPasswordAuthPress) {
    actions.push({
      kind: 'passwordAuth',
      actionLabel: 'Agregar',
      description: 'Crea una clave de respaldo para entrar y validar este dispositivo.',
      icon: 'key-outline',
      loadingLabel: 'Abriendo Perfil...',
      onPress: onPasswordAuthPress,
      statusLabel: 'Acceso',
      title: 'Clave de respaldo',
      tone: 'recommended',
    });
  }

  if (needsGoogleAuth && onGoogleAuthPress) {
    actions.push({
      kind: 'googleAuth',
      actionLabel: 'Vincular',
      description: 'Conecta Google como metodo alterno para recuperar el acceso.',
      icon: 'logo-google',
      loadingLabel: 'Abriendo Perfil...',
      onPress: onGoogleAuthPress,
      statusLabel: 'Acceso',
      title: 'Google',
      tone: 'recommended',
    });
  }

  if (needsAppleAuth && onAppleAuthPress) {
    actions.push({
      kind: 'appleAuth',
      actionLabel: 'Vincular',
      description: 'Conecta Apple como metodo alterno para entrar a tu cuenta.',
      icon: 'logo-apple',
      loadingLabel: 'Abriendo Perfil...',
      onPress: onAppleAuthPress,
      statusLabel: 'Acceso',
      title: 'Apple',
      tone: 'recommended',
    });
  }

  if (needsContacts) {
    actions.push({
      kind: 'contacts',
      actionLabel: 'Permitir',
      description: 'Encuentra personas conocidas sin escribir todos los datos a mano.',
      icon: 'people-outline',
      loadingLabel: 'Pidiendo permiso...',
      onPress: onContactsPress,
      statusLabel: 'Conexion',
      title: 'Contactos',
      tone: 'recommended',
    });
  }

  if (needsNotifications) {
    actions.push({
      kind: 'notifications',
      actionLabel: 'Activar',
      description: 'Recibe avisos de solicitudes, recordatorios y cierres pendientes.',
      icon: 'notifications-outline',
      loadingLabel: 'Activando...',
      onPress: onNotificationsPress,
      statusLabel: 'Avisos',
      title: 'Recordatorios',
      tone: 'recommended',
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <SurfaceCard padding="md" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconHalo}>
          <Ionicons color={theme.colors.primary} name="options-outline" size={21} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Termina tu configuracion</Text>
          <Text style={styles.body}>{summaryCopy(actions.length)}</Text>
        </View>
        {dismissible ? (
          <Pressable
            disabled={Boolean(busyKind)}
            onPress={onDismiss}
            style={({ pressed }) => [styles.dismissButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.dismissText}>Omitir</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        {actions.map((action, index) => (
          <View key={action.kind} style={index > 0 ? styles.actionDivider : null}>
            <ActionRow action={action} busyKind={busyKind} />
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  iconHalo: {
    alignItems: 'center',
    backgroundColor: theme.colors.primaryGhost,
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
  dismissButton: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
  },
  dismissText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
  },
  actions: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionDivider: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 70,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    marginTop: 1,
    width: 36,
  },
  actionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  actionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 18,
  },
  actionDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  statusBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 11,
    textTransform: 'uppercase',
  },
  actionCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 24,
    paddingTop: 5,
  },
  actionCtaText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
  },
  actionBusy: {
    alignItems: 'center',
    gap: 3,
    minWidth: 58,
  },
  actionMotion: {
    marginRight: -3,
    marginTop: -1,
  },
  loadingLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
    paddingTop: 7,
  },
  pressed: {
    opacity: 0.68,
  },
  disabled: {
    opacity: 0.48,
  },
});
