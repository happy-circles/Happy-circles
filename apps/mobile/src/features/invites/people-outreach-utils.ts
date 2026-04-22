import * as Contacts from 'expo-contacts';

import { appConfig } from '@/lib/config';
import { formatCop } from '@/lib/data';
import type {
  AccountInviteDeliveryResult,
  PeopleOutreachResult,
  PeopleTargetResolution,
} from '@/lib/live-data';
import {
  buildPhoneE164,
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  normalizePhoneDigits,
} from '@/lib/phone';

export type FriendshipOrAccountResult = PeopleOutreachResult['result'];

export type ContactPhoneOption = {
  readonly id: string;
  readonly label: string | null;
  readonly phoneE164: string;
  readonly maskedPhone: string;
};

export type ContactCandidate = {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneOptions: readonly ContactPhoneOption[];
  readonly primaryPhone: ContactPhoneOption;
  readonly searchKey: string;
};

export type PendingContactSelection = {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneOptions: readonly ContactPhoneOption[];
};

export function buildAppInviteLink(deliveryToken: string): string {
  return `${appConfig.appWebOrigin.replace(/\/$/, '')}/join/${deliveryToken}`;
}

export function buildFriendshipInviteLink(deliveryToken: string): string {
  return `${appConfig.appWebOrigin.replace(/\/$/, '')}/invite/${deliveryToken}`;
}

export function buildAccountInviteShareMessage(input: {
  readonly inviteeAlias: string;
  readonly amountMinor: number | null;
  readonly direction: 'i_owe' | 'owes_me' | null;
  readonly description: string | null;
  readonly inviteLink: string;
}): string {
  const alias = input.inviteeAlias.trim();
  const prefix = alias.length > 0 ? `Hola ${alias},` : 'Hola,';

  if (input.amountMinor && input.amountMinor > 0 && input.direction) {
    const movementText =
      input.direction === 'i_owe'
        ? `una salida de ${formatCop(input.amountMinor)}`
        : `una entrada de ${formatCop(input.amountMinor)}`;
    const descriptionText =
      input.description && input.description.trim().length > 0
        ? ` por ${input.description.trim()}`
        : '';

    return `${prefix} te comparti un acceso privado a Happy Circles para registrar ${movementText}${descriptionText}. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
  }

  return `${prefix} te comparti un acceso privado a Happy Circles para que entres y te conectes conmigo. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
}

function maskPhoneValue(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length < 4) {
    return value;
  }

  return `***${digits.slice(-4)}`;
}

export function formatPhonePreview(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length === 0) {
    return value;
  }

  if (value.trim().startsWith('+')) {
    return `+${digits}`;
  }

  return digits;
}

function resolveContactName(contact: Contacts.Contact | Contacts.ExistingContact): string {
  const normalizedName = contact.name?.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const composedName = [contact.firstName, contact.middleName, contact.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ')
    .trim();

  if (composedName.length > 0) {
    return composedName;
  }

  return 'Contacto';
}

function findCountryOptionByPhoneNumber(rawNumber: string) {
  const trimmed = rawNumber.trim();
  if (!trimmed.startsWith('+')) {
    return DEFAULT_COUNTRY;
  }

  const digits = normalizePhoneDigits(trimmed);
  const sortedOptions = [...COUNTRY_OPTIONS].sort(
    (left, right) =>
      normalizePhoneDigits(right.callingCode).length -
      normalizePhoneDigits(left.callingCode).length,
  );

  for (const option of sortedOptions) {
    if (digits.startsWith(normalizePhoneDigits(option.callingCode))) {
      return option;
    }
  }

  return DEFAULT_COUNTRY;
}

export function buildManualPhoneE164(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('+')) {
    const digits = normalizePhoneDigits(trimmed);
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = normalizePhoneDigits(trimmed);
  if (digits.length < 8) {
    return null;
  }

  return buildPhoneE164(DEFAULT_COUNTRY.callingCode, digits);
}

export function extractInviteToken(scannedValue: string): string | null {
  const normalized = scannedValue.trim();
  if (normalized.length === 0) {
    return null;
  }

  const httpsMatch = normalized.match(/\/invite\/([^/?#]+)/i);
  if (httpsMatch?.[1]) {
    return httpsMatch[1];
  }

  const deepLinkMatch = normalized.match(/happycircles:\/\/invite\/([^/?#]+)/i);
  if (deepLinkMatch?.[1]) {
    return deepLinkMatch[1];
  }

  const rawTokenMatch = normalized.match(/^[a-z0-9]{12,}$/i);
  if (rawTokenMatch?.[0]) {
    return rawTokenMatch[0];
  }

  return null;
}

export function isAccountInviteDeliveryResult(
  value: FriendshipOrAccountResult | undefined,
): value is AccountInviteDeliveryResult {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'deliveryToken' in value &&
    typeof value.deliveryToken === 'string',
  );
}

function buildContactPhoneOptions(
  contact: Contacts.Contact | Contacts.ExistingContact,
): ContactPhoneOption[] {
  const phoneNumbers = contact.phoneNumbers ?? [];

  return phoneNumbers.flatMap((phoneNumber, index) => {
    const rawNumber = phoneNumber.number?.trim();
    if (!rawNumber) {
      return [];
    }

    const country = findCountryOptionByPhoneNumber(rawNumber);
    const digits = normalizePhoneDigits(rawNumber);
    const callingCodeDigits = normalizePhoneDigits(country.callingCode);
    const nationalNumber =
      rawNumber.startsWith('+') && digits.startsWith(callingCodeDigits)
        ? digits.slice(callingCodeDigits.length)
        : digits;
    const phoneE164 = rawNumber.startsWith('+')
      ? `+${digits}`
      : buildPhoneE164(country.callingCode, nationalNumber);

    if (normalizePhoneDigits(phoneE164).length < 8) {
      return [];
    }

    return [
      {
        id: typeof phoneNumber.id === 'string' ? phoneNumber.id : `phone-${index}`,
        label:
          typeof phoneNumber.label === 'string' && phoneNumber.label.trim().length > 0
            ? phoneNumber.label.trim()
            : null,
        phoneE164,
        maskedPhone: maskPhoneValue(phoneE164),
      },
    ];
  });
}

export async function readContactsFromDevice(): Promise<readonly ContactCandidate[]> {
  const response = await Contacts.getContactsAsync({
    fields: [
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.MiddleName,
      Contacts.Fields.LastName,
      Contacts.Fields.PhoneNumbers,
    ],
  });

  const records: ContactCandidate[] = [];
  for (const contact of response.data) {
    const alias = resolveContactName(contact);
    const phoneOptions = buildContactPhoneOptions(contact);
    if (phoneOptions.length === 0) {
      continue;
    }

    records.push({
      contactId: contact.id,
      alias,
      phoneOptions,
      primaryPhone: phoneOptions[0],
      searchKey:
        `${alias} ${phoneOptions.map((option) => option.phoneE164).join(' ')}`.toLocaleLowerCase(
          'es-CO',
        ),
    });
  }

  return records.sort((left, right) => left.alias.localeCompare(right.alias, 'es-CO'));
}

export function badgeForResolution(resolution: PeopleTargetResolution | null): {
  readonly label: string;
  readonly tone: 'neutral' | 'success' | 'warning' | 'primary';
} {
  if (!resolution) {
    return {
      label: 'Revisando',
      tone: 'neutral',
    };
  }

  if (resolution.status === 'already_related') {
    return {
      label: 'Conectados',
      tone: 'success',
    };
  }

  if (resolution.status === 'pending_friendship') {
    return {
      label: 'Solicitud pendiente',
      tone: 'primary',
    };
  }

  if (resolution.status === 'active_user') {
    return {
      label: 'En Happy Circles',
      tone: 'success',
    };
  }

  return {
    label: 'Invitar a la app',
    tone: 'warning',
  };
}

export function actionLabelForResolution(resolution: PeopleTargetResolution | null): string {
  if (!resolution) {
    return 'Revisar contacto';
  }

  if (resolution.status === 'already_related') {
    return 'Ya estan conectados';
  }

  if (resolution.status === 'pending_friendship' || resolution.status === 'pending_activation') {
    return 'Ya tiene una invitacion pendiente';
  }

  if (resolution.status === 'active_user') {
    return 'Enviar solicitud de amistad';
  }

  return 'Invitar a Happy Circles';
}

export function canPressForResolution(resolution: PeopleTargetResolution | null): boolean {
  if (!resolution) {
    return true;
  }

  return resolution.status !== 'already_related' && resolution.status !== 'pending_friendship';
}

export function buildContactMeta(contact: ContactCandidate): string {
  const primaryLine = [
    contact.primaryPhone.label,
    formatPhonePreview(contact.primaryPhone.phoneE164),
  ]
    .filter(Boolean)
    .join(' | ');

  if (contact.phoneOptions.length === 1) {
    return primaryLine;
  }

  return `${primaryLine} | ${contact.phoneOptions.length} numeros`;
}
