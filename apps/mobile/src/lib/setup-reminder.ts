import type { ActivityItemDto } from '@happy-circles/application';

import { getStoredItem, setStoredItem } from '@/lib/storage';

const SETUP_PROMPT_DISMISSED_KEY = 'happy_circles.setup_prompt_dismissed';

function storageKey(userId: string | null): string {
  return userId ? `${SETUP_PROMPT_DISMISSED_KEY}.${userId}` : SETUP_PROMPT_DISMISSED_KEY;
}

export async function getSetupPromptDismissed(userId: string | null): Promise<boolean> {
  return (await getStoredItem(storageKey(userId))) === 'true';
}

export async function dismissSetupPrompt(userId: string | null): Promise<void> {
  await setStoredItem(storageKey(userId), 'true');
}

function setupReminderSubtitle(needsContacts: boolean, needsNotifications: boolean): string {
  if (needsContacts && needsNotifications) {
    return 'Activa contactos y recordatorios cuando quieras terminar la configuracion.';
  }

  if (needsContacts) {
    return 'Permite contactos cuando quieras encontrar personas mas rapido.';
  }

  return 'Activa recordatorios cuando quieras recibir avisos sobre pendientes.';
}

export function buildSetupReminderItem({
  needsContacts,
  needsNotifications,
}: {
  readonly needsContacts: boolean;
  readonly needsNotifications: boolean;
}): ActivityItemDto | null {
  if (!needsContacts && !needsNotifications) {
    return null;
  }

  return {
    id: 'local-setup-reminder',
    kind: 'system_note',
    sourceType: 'system',
    title: 'Termina los ajustes de la app',
    subtitle: setupReminderSubtitle(needsContacts, needsNotifications),
    status: 'pending',
    detail: needsContacts
      ? 'Puedes retomarlo desde Personas o Perfil.'
      : 'Puedes retomarlo desde Perfil.',
    href: needsContacts ? '/people' : '/profile',
    counterpartyLabel: 'Happy Circles',
  };
}
