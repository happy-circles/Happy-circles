import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  triggerIdentitySelectionHaptic as triggerSelectionHaptic,
  triggerIdentitySuccessHaptic as triggerSuccessHaptic,
  triggerIdentityWarningHaptic as triggerWarningHaptic,
} from '@/lib/identity-flow-haptics';
import type { SetupPermissionStatus } from '@/providers/session/types';
import { useAppTheme } from '@/providers/theme-provider';

import type { SecurityTone } from './setup-account-helpers';
import { styles } from './setup-account-screen-runtime.styles';
import { SecurityStatusRow } from './setup-security-status-row';

type OnboardingPermissionKey = 'contacts' | 'notifications';

function formatOnboardingPermissionStateLabel(status: SetupPermissionStatus): string {
  if (status === 'granted') {
    return 'Listo';
  }

  if (status === 'limited') {
    return 'Limitado';
  }

  if (status === 'denied') {
    return 'Bloqueado';
  }

  if (status === 'unavailable') {
    return 'No disponible';
  }

  return 'Pendiente';
}

function formatOnboardingPermissionSubtitle(
  key: OnboardingPermissionKey,
  status: SetupPermissionStatus,
): string {
  if (key === 'contacts') {
    if (status === 'granted') {
      return 'Agenda activa para encontrar personas que ya conoces.';
    }

    if (status === 'limited') {
      return 'El telefono compartio solo algunos contactos.';
    }

    if (status === 'denied') {
      return 'Puedes activarlo despues desde Ajustes.';
    }

    if (status === 'unavailable') {
      return 'No disponible en este entorno.';
    }

    return 'Activalo ahora o hazlo despues desde Perfil.';
  }

  if (status === 'granted') {
    return 'Recordatorios activados para pendientes importantes.';
  }

  if (status === 'denied') {
    return 'Puedes activarlas despues desde Ajustes.';
  }

  if (status === 'unavailable') {
    return 'No disponibles en este entorno.';
  }

  return 'Activalas ahora o hazlo despues desde Perfil.';
}

function resolveOnboardingPermissionTone(status: SetupPermissionStatus): SecurityTone {
  if (status === 'granted' || status === 'limited') {
    return 'success';
  }

  if (status === 'denied') {
    return 'danger';
  }

  return 'muted';
}

function resolveOnboardingPermissionActionLabel(status: SetupPermissionStatus): string | null {
  if (status === 'undetermined') {
    return 'Activar';
  }

  if (status === 'denied') {
    return 'Ajustes';
  }

  return null;
}

export function SetupAccountPermissionsSection({
  contactsPermissionStatus,
  notificationsPermissionStatus,
  onMessage,
  requestContactsPermission,
  requestNotificationsPermission,
}: {
  readonly contactsPermissionStatus: SetupPermissionStatus;
  readonly notificationsPermissionStatus: SetupPermissionStatus;
  readonly onMessage: (message: string | null) => void;
  readonly requestContactsPermission: () => Promise<string>;
  readonly requestNotificationsPermission: () => Promise<string>;
}) {
  const activeTheme = useAppTheme();
  const [permissionBusyKey, setPermissionBusyKey] = useState<OnboardingPermissionKey | null>(null);
  const dynamicStyles = useMemo(
    () => ({
      inlineButton: {
        backgroundColor: activeTheme.colors.elevated,
        borderColor: activeTheme.colors.border,
      },
      inlineButtonText: {
        color: activeTheme.colors.primaryStrong,
      },
      sectionBlock: {
        borderTopColor: activeTheme.colors.hairline,
      },
      sectionTitle: {
        color: activeTheme.colors.text,
      },
      separator: {
        backgroundColor: activeTheme.colors.hairline,
      },
    }),
    [activeTheme],
  );
  const contactsPermissionActionLabel =
    resolveOnboardingPermissionActionLabel(contactsPermissionStatus);
  const notificationsPermissionActionLabel = resolveOnboardingPermissionActionLabel(
    notificationsPermissionStatus,
  );

  function openOnboardingPermissionSettings(key: OnboardingPermissionKey) {
    Alert.alert(
      key === 'contacts' ? 'Permiso de contactos bloqueado' : 'Notificaciones bloqueadas',
      key === 'contacts'
        ? 'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.'
        : 'Abre Ajustes y permite notificaciones para activar recordatorios.',
      [
        { style: 'cancel', text: 'Ahora no' },
        { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
      ],
    );
  }

  async function handleContactsPermission() {
    if (permissionBusyKey) {
      return;
    }

    triggerSelectionHaptic();

    if (contactsPermissionStatus === 'denied') {
      triggerWarningHaptic();
      openOnboardingPermissionSettings('contacts');
      return;
    }

    if (contactsPermissionStatus !== 'undetermined') {
      return;
    }

    setPermissionBusyKey('contacts');
    onMessage(null);

    try {
      const result = await requestContactsPermission();
      onMessage(result);

      if (result === 'Contactos activados.' || result.includes('compartio')) {
        triggerSuccessHaptic();
        return;
      }

      triggerWarningHaptic();
      if (result.includes('Ajustes')) {
        openOnboardingPermissionSettings('contacts');
      }
    } catch (error) {
      triggerWarningHaptic();
      onMessage(error instanceof Error ? error.message : 'No se pudo abrir contactos.');
    } finally {
      setPermissionBusyKey(null);
    }
  }

  async function handleNotificationsPermission() {
    if (permissionBusyKey) {
      return;
    }

    triggerSelectionHaptic();

    if (notificationsPermissionStatus === 'denied') {
      triggerWarningHaptic();
      openOnboardingPermissionSettings('notifications');
      return;
    }

    if (notificationsPermissionStatus !== 'undetermined') {
      return;
    }

    setPermissionBusyKey('notifications');
    onMessage(null);

    try {
      const result = await requestNotificationsPermission();
      onMessage(result);

      if (result === 'Recordatorios activados.') {
        triggerSuccessHaptic();
        return;
      }

      triggerWarningHaptic();
      if (result.includes('Ajustes')) {
        openOnboardingPermissionSettings('notifications');
      }
    } catch (error) {
      triggerWarningHaptic();
      onMessage(error instanceof Error ? error.message : 'No se pudo abrir notificaciones.');
    } finally {
      setPermissionBusyKey(null);
    }
  }

  function renderPermissionTrailing(
    key: OnboardingPermissionKey,
    status: SetupPermissionStatus,
    actionLabel: string | null,
    onPress: () => void,
  ) {
    if (!actionLabel) {
      return undefined;
    }

    const statusColor =
      status === 'granted' || status === 'limited'
        ? activeTheme.colors.success
        : status === 'denied'
          ? activeTheme.colors.danger
          : activeTheme.colors.textMuted;

    return (
      <View style={styles.permissionTrailing}>
        <AppText style={[styles.permissionStatus, { color: statusColor }]}>
          {formatOnboardingPermissionStateLabel(status)}
        </AppText>
        <Pressable
          disabled={permissionBusyKey !== null}
          onPress={onPress}
          style={({ pressed }) => [
            styles.inlineButton,
            dynamicStyles.inlineButton,
            pressed && permissionBusyKey === null ? styles.pressed : null,
            permissionBusyKey !== null ? styles.disabledAction : null,
          ]}
        >
          <AppText style={[styles.inlineButtonText, dynamicStyles.inlineButtonText]}>
            {permissionBusyKey === key ? 'Abriendo...' : actionLabel}
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.sectionBlock, dynamicStyles.sectionBlock]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <AppText style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>
            Permisos recomendados
          </AppText>
        </View>
      </View>

      <View style={styles.securityList}>
        <SecurityStatusRow
          icon="people"
          status={formatOnboardingPermissionStateLabel(contactsPermissionStatus)}
          subtitle={formatOnboardingPermissionSubtitle('contacts', contactsPermissionStatus)}
          title="Contactos"
          tone={resolveOnboardingPermissionTone(contactsPermissionStatus)}
          trailing={renderPermissionTrailing(
            'contacts',
            contactsPermissionStatus,
            contactsPermissionActionLabel,
            () => void handleContactsPermission(),
          )}
        />

        <View style={[styles.separator, dynamicStyles.separator]} />

        <SecurityStatusRow
          icon="notifications"
          status={formatOnboardingPermissionStateLabel(notificationsPermissionStatus)}
          subtitle={formatOnboardingPermissionSubtitle(
            'notifications',
            notificationsPermissionStatus,
          )}
          title="Notificaciones"
          tone={resolveOnboardingPermissionTone(notificationsPermissionStatus)}
          trailing={renderPermissionTrailing(
            'notifications',
            notificationsPermissionStatus,
            notificationsPermissionActionLabel,
            () => void handleNotificationsPermission(),
          )}
        />
      </View>
    </View>
  );
}
