import type { FriendshipInviteDeliveryResult, PeopleTargetResolution } from '@/lib/live-data';
import { theme, type AppTheme } from '@/lib/theme';
import type {
  ContactCandidate,
  ContactPhoneOption,
} from '@/features/invites/people-outreach-utils';

export const CONTACT_TARGET_RESOLUTION_LIMIT = 60;
export const CONTACT_RESOLUTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CONTACT_RESOLUTION_MAX_CONCURRENT_REQUESTS = 1;
export const CONTACT_DISPLAY_LIMIT = 36;
export const CONTACT_SEARCH_DISPLAY_LIMIT = 60;

export type EnrichedContact = {
  readonly contact: ContactCandidate;
  readonly resolution: PeopleTargetResolution | null;
};

export type AddPersonTransactionContext = {
  readonly amountMinor: number;
  readonly description: string | null;
  readonly direction: 'i_owe' | 'owes_me';
};

export type ContactActionIconName =
  | 'list-outline'
  | 'sync-outline'
  | 'person-add-outline'
  | 'paper-plane-outline'
  | 'time-outline'
  | 'checkmark-outline';

export function contactAvatarColor(contact: ContactCandidate, activeTheme: AppTheme = theme): string {
  const source = `${contact.contactId}:${contact.alias}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return (
    activeTheme.palette.contactAvatar[hash % activeTheme.palette.contactAvatar.length] ??
    activeTheme.colors.primary
  );
}

export function actionMetaForResolution(
  resolution: PeopleTargetResolution | null,
  hasMultiplePhones: boolean,
): {
  readonly label: string;
  readonly icon: ContactActionIconName;
  readonly tone: 'primary' | 'invite' | 'muted';
  readonly disabled: boolean;
} {
  if (hasMultiplePhones) {
    return {
      disabled: false,
      icon: 'list-outline',
      label: 'Elegir',
      tone: 'primary',
    };
  }

  if (!resolution) {
    return {
      disabled: true,
      icon: 'sync-outline',
      label: '...',
      tone: 'muted',
    };
  }

  if (resolution.status === 'active_user') {
    return {
      disabled: false,
      icon: 'person-add-outline',
      label: 'Agregar',
      tone: 'primary',
    };
  }

  if (resolution.status === 'no_account') {
    return {
      disabled: false,
      icon: 'paper-plane-outline',
      label: 'Invitar',
      tone: 'invite',
    };
  }

  if (resolution.status === 'pending_activation') {
    return {
      disabled: false,
      icon: 'paper-plane-outline',
      label: 'Reenviar',
      tone: 'invite',
    };
  }

  if (resolution.status === 'pending_friendship') {
    return {
      disabled: true,
      icon: 'time-outline',
      label: 'Pendiente',
      tone: 'muted',
    };
  }

  return {
    disabled: true,
    icon: 'checkmark-outline',
    label: 'Agregado',
    tone: 'muted',
  };
}

export function shouldShowInApp(resolution: PeopleTargetResolution | null): boolean {
  return (
    resolution?.status === 'active_user' ||
    resolution?.status === 'already_related' ||
    resolution?.status === 'pending_friendship'
  );
}

export function rankContactResolution(resolution: PeopleTargetResolution | null): number {
  if (resolution?.status === 'active_user') {
    return 0;
  }

  if (resolution?.status === 'pending_friendship') {
    return 1;
  }

  if (resolution?.status === 'already_related') {
    return 2;
  }

  if (resolution?.status === 'pending_activation') {
    return 3;
  }

  if (resolution?.status === 'no_account') {
    return 4;
  }

  return 5;
}

export function compareEnrichedContacts(left: EnrichedContact, right: EnrichedContact): number {
  const rankDelta =
    rankContactResolution(left.resolution) - rankContactResolution(right.resolution);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  const aliasDelta = left.contact.alias.localeCompare(right.contact.alias, 'es-CO');
  if (aliasDelta !== 0) {
    return aliasDelta;
  }

  return left.contact.primaryPhone.phoneE164.localeCompare(right.contact.primaryPhone.phoneE164);
}

export function uniqueContactPhoneE164List(
  contacts: readonly ContactCandidate[],
): readonly string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const contact of contacts) {
    for (const option of contact.phoneOptions) {
      if (seen.has(option.phoneE164)) {
        continue;
      }

      seen.add(option.phoneE164);
      phones.push(option.phoneE164);
    }
  }

  return phones;
}

export function chunkContactPhoneE164List(
  phoneE164List: readonly string[],
  limit = CONTACT_TARGET_RESOLUTION_LIMIT,
): string[][] {
  if (limit <= 0) {
    return [];
  }

  const chunks: string[][] = [];
  for (let index = 0; index < phoneE164List.length; index += limit) {
    chunks.push(phoneE164List.slice(index, index + limit));
  }

  return chunks;
}

export function getUnresolvedContactPhoneE164List(input: {
  readonly phoneE164List: readonly string[];
  readonly targetCache: Readonly<Record<string, PeopleTargetResolution>>;
  readonly pendingPhoneE164Set?: ReadonlySet<string>;
  readonly inFlightPhoneE164Set?: ReadonlySet<string>;
}): readonly string[] {
  const seen = new Set<string>();
  const unresolved: string[] = [];

  for (const phoneE164 of input.phoneE164List) {
    if (
      seen.has(phoneE164) ||
      input.targetCache[phoneE164] ||
      input.pendingPhoneE164Set?.has(phoneE164) ||
      input.inFlightPhoneE164Set?.has(phoneE164)
    ) {
      continue;
    }

    seen.add(phoneE164);
    unresolved.push(phoneE164);
  }

  return unresolved;
}

export function buildContactSectionItems(input: {
  readonly contacts: readonly ContactCandidate[];
  readonly targetCache: Readonly<Record<string, PeopleTargetResolution>>;
  readonly searchValue: string;
}): {
  readonly filteredContacts: readonly ContactCandidate[];
  readonly visibleResolutionContacts: readonly ContactCandidate[];
  readonly inAppContacts: readonly EnrichedContact[];
  readonly inviteContacts: readonly EnrichedContact[];
} {
  const normalizedSearch = input.searchValue.trim().toLocaleLowerCase('es-CO');
  const filteredContacts =
    normalizedSearch.length === 0
      ? input.contacts
      : input.contacts.filter((contact) => contact.searchKey.includes(normalizedSearch));
  const displayLimit =
    normalizedSearch.length > 0 ? CONTACT_SEARCH_DISPLAY_LIMIT : CONTACT_DISPLAY_LIMIT;
  const enrichedContacts = filteredContacts.map((contact) => ({
    contact,
    resolution: input.targetCache[contact.primaryPhone.phoneE164] ?? null,
  }));

  return {
    filteredContacts,
    visibleResolutionContacts: filteredContacts.slice(0, CONTACT_TARGET_RESOLUTION_LIMIT),
    inAppContacts: enrichedContacts
      .filter((item) => shouldShowInApp(item.resolution))
      .sort(compareEnrichedContacts)
      .slice(0, displayLimit),
    inviteContacts: enrichedContacts
      .filter((item) => !shouldShowInApp(item.resolution))
      .sort(compareEnrichedContacts)
      .slice(0, displayLimit),
  };
}

export function contactMeta(phoneOption: ContactPhoneOption): string {
  const number = formatPhonePreview(phoneOption.phoneE164);
  if (phoneOption.label) {
    return `${phoneOption.label} ${number}`;
  }

  return number;
}

function formatPhonePreview(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) {
    return value;
  }

  if (value.trim().startsWith('+')) {
    return `+${digits}`;
  }

  return digits;
}

export function formatQrExpiry(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'QR temporal';
  }

  return `Vence ${new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))}`;
}

export function isFreshQrDelivery(
  delivery: FriendshipInviteDeliveryResult | null,
): delivery is FriendshipInviteDeliveryResult {
  if (!delivery) {
    return false;
  }

  const timestamp = Date.parse(delivery.expiresAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp - Date.now() > 60_000;
}
