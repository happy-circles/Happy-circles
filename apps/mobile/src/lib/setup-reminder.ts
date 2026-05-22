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
    title: 'Confía este teléfono',
    subtitle: 'Seguridad',
    detail: 'Abrir seguridad del perfil.',
    href: '/profile?section=device&focus=trust-device',
  });
}

export function buildBiometricsReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-biometrics-reminder',
    title: 'Activa Face ID o huella',
    subtitle: 'Seguridad',
    detail: 'Abrir seguridad del perfil.',
    href: '/profile?section=account&focus=biometrics',
  });
}

export function buildPasswordAuthReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-password-auth-reminder',
    title: 'Crea tu contraseña de respaldo',
    subtitle: 'Acceso',
    detail: 'Abrir métodos de acceso.',
    href: '/profile?section=methods&focus=attach-password',
  });
}

export function buildGoogleAuthReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-google-auth-reminder',
    title: 'Vincula tu cuenta Google',
    subtitle: 'Acceso',
    detail: 'Abrir métodos de acceso.',
    href: '/profile?section=methods',
  });
}

export function buildAppleAuthReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-apple-auth-reminder',
    title: 'Vincula tu cuenta Apple',
    subtitle: 'Acceso',
    detail: 'Abrir métodos de acceso.',
    href: '/profile?section=methods',
  });
}

export function buildContactsReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-contacts-reminder',
    title: 'Activa tus contactos',
    subtitle: 'Amigos',
    detail: 'Abrir Personas.',
    href: '/people?addPerson=1',
  });
}

export function buildNotificationsReminderItem(): ActivityItemDto {
  return buildReminderItem({
    id: 'local-notifications-reminder',
    title: 'Activa tus notificaciones',
    subtitle: 'Avisos',
    detail: 'Abrir Recordatorios.',
    href: '/profile?focus=notifications',
  });
}

export interface PendingSetupReminderInput {
  readonly accountAccessState?: string | null;
  readonly appleSignInAvailable: boolean;
  readonly biometricAvailable: boolean;
  readonly biometricsEnabled: boolean;
  readonly isTrustedDevice: boolean;
  readonly linkedMethods: {
    readonly hasApple: boolean;
    readonly hasEmailPassword: boolean;
    readonly hasGoogle: boolean;
  };
  readonly notificationsEnabled: boolean;
  readonly profileCompletionState?: string | null;
  readonly setupState: {
    readonly contactsPermissionStatus?: string | null;
  };
}

export function buildPendingSetupReminderItems(
  input: PendingSetupReminderInput,
): readonly ActivityItemDto[] {
  const accountSetupEligible =
    input.accountAccessState === 'active' && input.profileCompletionState === 'complete';
  const contactsPermissionStatus = input.setupState.contactsPermissionStatus;
  const needsContacts =
    contactsPermissionStatus !== 'granted' && contactsPermissionStatus !== 'limited';
  const needsPasswordAuth = accountSetupEligible && !input.linkedMethods.hasEmailPassword;
  const needsGoogleAuth = accountSetupEligible && !input.linkedMethods.hasGoogle;
  const needsAppleAuth =
    accountSetupEligible && input.appleSignInAvailable && !input.linkedMethods.hasApple;

  return [
    accountSetupEligible && !input.isTrustedDevice ? buildDeviceTrustReminderItem() : null,
    accountSetupEligible && input.biometricAvailable && !input.biometricsEnabled
      ? buildBiometricsReminderItem()
      : null,
    needsPasswordAuth ? buildPasswordAuthReminderItem() : null,
    needsGoogleAuth ? buildGoogleAuthReminderItem() : null,
    needsAppleAuth ? buildAppleAuthReminderItem() : null,
    needsContacts ? buildContactsReminderItem() : null,
    !input.notificationsEnabled ? buildNotificationsReminderItem() : null,
  ].filter((item): item is ActivityItemDto => Boolean(item));
}
