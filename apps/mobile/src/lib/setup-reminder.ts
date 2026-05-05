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

function buildReminderItem({
  detail,
  href,
  id,
  subtitle,
  title,
}: {
  readonly detail: string;
  readonly href: string;
  readonly id: string;
  readonly subtitle: string;
  readonly title: string;
}): ActivityItemDto {
  return {
    id,
    kind: 'system_note',
    sourceType: 'system',
    title,
    subtitle,
    status: 'pending',
    detail,
    href,
    counterpartyLabel: 'Happy Circles',
  };
}

export function buildDeviceTrustReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-device-trust-reminder',
    title: 'Dispositivo confiable',
    subtitle: 'Autoriza este telefono para cambios sensibles y revisiones de cuenta.',
    detail: 'Abrir seguridad del perfil.',
    href: '/profile?section=device&focus=trust-password',
  });
}

export function buildBiometricsReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-biometrics-reminder',
    title: 'Biometria',
    subtitle: 'Usala para abrir la app y confirmar acciones protegidas.',
    detail: 'Abrir seguridad del perfil.',
    href: '/profile?section=account&focus=biometrics',
  });
}

export function buildPasswordAuthReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-password-auth-reminder',
    title: 'Clave de respaldo',
    subtitle: 'Crea una clave para entrar y validar este dispositivo si hace falta.',
    detail: 'Abrir metodos de acceso.',
    href: '/profile?section=methods&focus=attach-password',
  });
}

export function buildGoogleAuthReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-google-auth-reminder',
    title: 'Google',
    subtitle: 'Vincula Google como metodo alterno para recuperar el acceso.',
    detail: 'Abrir metodos de acceso.',
    href: '/profile?section=methods',
  });
}

export function buildAppleAuthReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-apple-auth-reminder',
    title: 'Apple',
    subtitle: 'Vincula Apple como metodo alterno para entrar a tu cuenta.',
    detail: 'Abrir metodos de acceso.',
    href: '/profile?section=methods',
  });
}

export function buildContactsReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-contacts-reminder',
    title: 'Contactos',
    subtitle: 'Permite contactos para encontrar personas conocidas mas rapido.',
    detail: 'Abrir Personas.',
    href: '/people?addPerson=1',
  });
}

export function buildNotificationsReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-notifications-reminder',
    title: 'Recordatorios',
    subtitle: 'Activa avisos de solicitudes, recordatorios y cierres pendientes.',
    detail: 'Abrir Recordatorios.',
    href: '/profile?focus=notifications',
  });
}
