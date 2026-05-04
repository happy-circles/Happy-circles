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

function setupReminderSubtitle(needsContacts: boolean): string {
  if (needsContacts) {
    return 'Contactos pendientes.';
  }

  return 'Recordatorios pendientes.';
}

function setupReminderHref(needsContacts: boolean): string {
  return needsContacts ? '/people?addPerson=1' : '/profile?focus=notifications';
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
    title: 'Ajuste pendiente',
    subtitle: setupReminderSubtitle(needsContacts),
    status: 'pending',
    detail: needsContacts ? 'Abrir Personas.' : 'Abrir Recordatorios.',
    href: setupReminderHref(needsContacts),
    counterpartyLabel: 'Happy Circles',
  };
}
