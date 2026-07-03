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

export const CONTACTS_PAGE_SIZE = 250;

const CONTACT_FIELDS = [
  Contacts.Fields.Name,
  Contacts.Fields.FirstName,
  Contacts.Fields.MiddleName,
  Contacts.Fields.LastName,
  Contacts.Fields.PhoneNumbers,
] as const;

const SORTED_COUNTRY_OPTIONS = [...COUNTRY_OPTIONS].sort(
  (left, right) =>
    normalizePhoneDigits(right.callingCode).length - normalizePhoneDigits(left.callingCode).length,
);

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

export type ContactsPageResult = {
  readonly contacts: readonly ContactCandidate[];
  readonly nextPageOffset: number;
  readonly hasNextPage: boolean;
};

const PHONE_E164_MIN_LENGTH = 8;
const PHONE_E164_MAX_LENGTH = 24;

export function buildAppInviteLink(deliveryToken: string): string {
  return `${appConfig.appWebOrigin.replace(/\/$/, '')}/join/${deliveryToken}`;
}

export function buildFriendshipInviteLink(deliveryToken: string): string {
  return `${appConfig.appWebOrigin.replace(/\/$/, '')}/invite/${deliveryToken}`;
}

function normalizeShareText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function buildInviteGreeting(inviteeAlias: string): string {
  const alias = normalizeShareText(inviteeAlias);
  return alias.length > 0 ? `Hola ${alias},` : 'Hola,';
}

function buildWhatsappShareMessage(input: {
  readonly body: string;
  readonly inviteLink: string;
  readonly inviteeAlias: string;
}): string {
  return [
    buildInviteGreeting(input.inviteeAlias),
    '',
    input.body,
    '',
    'Abre tu invitación aquí:',
    input.inviteLink,
  ].join('\n');
}

export function buildFriendshipInviteShareMessage(input: {
  readonly inviteeAlias: string;
  readonly inviteLink: string;
}): string {
  return buildWhatsappShareMessage({
    body: 'Te compartí una invitación a *Happy Circles* para que te conectes conmigo.',
    inviteLink: input.inviteLink,
    inviteeAlias: input.inviteeAlias,
  });
}

export function buildAccountInviteShareMessage(input: {
  readonly inviteeAlias: string;
  readonly amountMinor: number | null;
  readonly direction: 'i_owe' | 'owes_me' | null;
  readonly description: string | null;
  readonly inviteLink: string;
}): string {
  if (input.amountMinor && input.amountMinor > 0 && input.direction) {
    const movementText =
      input.direction === 'i_owe'
        ? `que yo te debo ${formatCop(input.amountMinor)}`
        : `que tú me debes ${formatCop(input.amountMinor)}`;
    const descriptionText =
      input.description && input.description.trim().length > 0
        ? ` por ${normalizeShareText(input.description)}`
        : '';

    return buildWhatsappShareMessage({
      body: `Te compartí un acceso privado a *Happy Circles* para registrar ${movementText}${descriptionText}.`,
      inviteLink: input.inviteLink,
      inviteeAlias: input.inviteeAlias,
    });
  }

  return buildWhatsappShareMessage({
    body: 'Te compartí un acceso privado a *Happy Circles* para que entres y te conectes conmigo.',
    inviteLink: input.inviteLink,
    inviteeAlias: input.inviteeAlias,
  });
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
  for (const option of SORTED_COUNTRY_OPTIONS) {
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
    const phoneE164 = `+${digits}`;
    return isValidContactPhoneE164(phoneE164) ? phoneE164 : null;
  }

  const digits = normalizePhoneDigits(trimmed);
  if (digits.length < PHONE_E164_MIN_LENGTH) {
    return null;
  }

  const phoneE164 = buildPhoneE164(DEFAULT_COUNTRY.callingCode, digits);
  return isValidContactPhoneE164(phoneE164) ? phoneE164 : null;
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

export function buildContactPhoneOptions(
  contact: Contacts.Contact | Contacts.ExistingContact,
): ContactPhoneOption[] {
  const phoneNumbers = contact.phoneNumbers ?? [];
  const seenPhones = new Set<string>();

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

    if (!isValidContactPhoneE164(phoneE164) || seenPhones.has(phoneE164)) {
      return [];
    }

    seenPhones.add(phoneE164);

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

function isValidContactPhoneE164(value: string): boolean {
  const normalized = value.trim();
  const digits = normalizePhoneDigits(normalized);

  return (
    normalized.startsWith('+') &&
    normalized.length <= PHONE_E164_MAX_LENGTH &&
    digits.length >= PHONE_E164_MIN_LENGTH
  );
}

function buildContactCandidate(
  contact: Contacts.Contact | Contacts.ExistingContact,
): ContactCandidate | null {
  const alias = resolveContactName(contact);
  const phoneOptions = buildContactPhoneOptions(contact);
  if (phoneOptions.length === 0) {
    return null;
  }

  const contactId =
    'id' in contact && typeof contact.id === 'string' && contact.id.trim().length > 0
      ? contact.id
      : phoneOptions[0].phoneE164;

  return {
    contactId,
    alias,
    phoneOptions,
    primaryPhone: phoneOptions[0],
    searchKey:
      `${alias} ${phoneOptions.map((option) => option.phoneE164).join(' ')}`.toLocaleLowerCase(
        'es-CO',
      ),
  };
}

export async function readContactsPageFromDevice(input: {
  readonly pageOffset: number;
  readonly pageSize?: number;
}): Promise<ContactsPageResult> {
  const pageSize = input.pageSize ?? CONTACTS_PAGE_SIZE;
  const response = await Contacts.getContactsAsync({
    fields: [...CONTACT_FIELDS],
    pageOffset: input.pageOffset,
    pageSize,
    sort: Contacts.SortTypes.FirstName,
  });

  const records: ContactCandidate[] = [];
  for (const contact of response.data) {
    const candidate = buildContactCandidate(contact);
    if (!candidate) {
      continue;
    }

    records.push(candidate);
  }

  const nextPageOffset =
    response.data.length > 0
      ? input.pageOffset + response.data.length
      : input.pageOffset + pageSize;

  return {
    contacts: records,
    nextPageOffset,
    hasNextPage: Boolean(response.hasNextPage),
  };
}

export async function readContactsFromDevice(): Promise<readonly ContactCandidate[]> {
  const records: ContactCandidate[] = [];
  let pageOffset = 0;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await readContactsPageFromDevice({ pageOffset });
    records.push(...page.contacts);
    pageOffset = page.nextPageOffset;
    hasNextPage = page.hasNextPage;
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
      label: 'Ya está en Happy Circles',
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
    return 'Ya están conectados';
  }

  if (resolution.status === 'pending_friendship' || resolution.status === 'pending_activation') {
    return 'Ya tiene una invitación pendiente';
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

  return `${primaryLine} | ${contact.phoneOptions.length} números`;
}
