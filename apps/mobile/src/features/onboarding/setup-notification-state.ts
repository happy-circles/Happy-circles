import type { SetupPermissionStatus } from '@/providers/session/types';

import type { SecurityTone } from './setup-account-helpers';

export function resolveSetupNotificationState(
  permissionStatus: SetupPermissionStatus,
  enabled: boolean,
): {
  readonly actionLabel: string | null;
  readonly statusLabel: string;
  readonly subtitle: string;
  readonly tone: SecurityTone;
} {
  if (permissionStatus === 'granted') {
    return enabled
      ? {
          actionLabel: null,
          statusLabel: 'Listo',
          subtitle: 'Recordatorios activados para pendientes importantes.',
          tone: 'success',
        }
      : {
          actionLabel: 'Activar',
          statusLabel: 'Pendiente',
          subtitle: 'El permiso está listo. Activa los recordatorios para recibir avisos.',
          tone: 'muted',
        };
  }

  if (permissionStatus === 'denied') {
    return {
      actionLabel: 'Ajustes',
      statusLabel: 'Bloqueado',
      subtitle: 'Puedes activarlas después desde Ajustes.',
      tone: 'danger',
    };
  }

  if (permissionStatus === 'unavailable') {
    return {
      actionLabel: null,
      statusLabel: 'No disponible',
      subtitle: 'No disponibles en este entorno.',
      tone: 'muted',
    };
  }

  return {
    actionLabel: permissionStatus === 'undetermined' ? 'Activar' : null,
    statusLabel: 'Pendiente',
    subtitle: 'Actívalas ahora o hazlo después desde Perfil.',
    tone: 'muted',
  };
}
