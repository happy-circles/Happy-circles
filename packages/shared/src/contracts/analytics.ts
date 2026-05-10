export const ANALYTICS_METADATA_KEYS = [
  'amountBucket',
  'category',
  'channel',
  'decision',
  'flow',
  'itemKind',
  'reason',
  'result',
  'route',
  'source',
  'status',
] as const;

export type AnalyticsMetadataKey = (typeof ANALYTICS_METADATA_KEYS)[number];

export const ANALYTICS_EVENT_FAMILIES = [
  'session',
  'navigation',
  'onboarding',
  'financial_request',
  'invite',
  'settlement',
] as const;

export type AnalyticsEventFamily = (typeof ANALYTICS_EVENT_FAMILIES)[number];

export const ANALYTICS_EVENT_KINDS = ['navigation', 'intent', 'outcome', 'lifecycle'] as const;

export type AnalyticsEventKind = (typeof ANALYTICS_EVENT_KINDS)[number];

export const ANALYTICS_FEATURE_KEYS = [
  'session',
  'navigation',
  'onboarding',
  'financial_requests',
  'invites',
  'settlements',
] as const;

export type AnalyticsFeatureKey = (typeof ANALYTICS_FEATURE_KEYS)[number];

export interface AnalyticsEventCatalogEntry {
  readonly eventName: string;
  readonly description: string;
  readonly family: AnalyticsEventFamily;
  readonly kind: AnalyticsEventKind;
  readonly featureKey: AnalyticsFeatureKey;
  readonly allowedMetadataKeys: readonly AnalyticsMetadataKey[];
}

export const ANALYTICS_EVENT_CATALOG = [
  {
    eventName: 'app_opened',
    description: 'La app se abrio con una sesion autenticada.',
    family: 'session',
    kind: 'lifecycle',
    featureKey: 'session',
    allowedMetadataKeys: [],
  },
  {
    eventName: 'app_backgrounded',
    description: 'La app paso a segundo plano o cerro la sesion visual.',
    family: 'session',
    kind: 'lifecycle',
    featureKey: 'session',
    allowedMetadataKeys: ['route'],
  },
  {
    eventName: 'screen_viewed',
    description: 'El usuario vio una pantalla o ruta principal.',
    family: 'navigation',
    kind: 'navigation',
    featureKey: 'navigation',
    allowedMetadataKeys: ['route'],
  },
  {
    eventName: 'registration_started',
    description: 'El usuario inicio un paso autenticado del registro o setup.',
    family: 'onboarding',
    kind: 'intent',
    featureKey: 'onboarding',
    allowedMetadataKeys: ['source'],
  },
  {
    eventName: 'registration_completed',
    description: 'El usuario completo el registro/setup requerido.',
    family: 'onboarding',
    kind: 'outcome',
    featureKey: 'onboarding',
    allowedMetadataKeys: ['source'],
  },
  {
    eventName: 'financial_request_started',
    description: 'El usuario envio el formulario para crear una solicitud financiera.',
    family: 'financial_request',
    kind: 'intent',
    featureKey: 'financial_requests',
    allowedMetadataKeys: ['category', 'source'],
  },
  {
    eventName: 'financial_request_created',
    description: 'La solicitud financiera se creo correctamente.',
    family: 'financial_request',
    kind: 'outcome',
    featureKey: 'financial_requests',
    allowedMetadataKeys: ['category', 'source', 'result'],
  },
  {
    eventName: 'financial_request_accepted',
    description: 'Una solicitud financiera fue aceptada y genero ledger.',
    family: 'financial_request',
    kind: 'outcome',
    featureKey: 'financial_requests',
    allowedMetadataKeys: ['source', 'result'],
  },
  {
    eventName: 'friendship_invite_created',
    description: 'Se creo una invitacion de amistad.',
    family: 'invite',
    kind: 'outcome',
    featureKey: 'invites',
    allowedMetadataKeys: ['channel', 'flow', 'source'],
  },
  {
    eventName: 'friendship_invite_accepted',
    description: 'Una invitacion de amistad fue aceptada.',
    family: 'invite',
    kind: 'outcome',
    featureKey: 'invites',
    allowedMetadataKeys: ['decision', 'flow', 'source'],
  },
  {
    eventName: 'settlement_proposal_viewed',
    description: 'El usuario abrio el detalle de una propuesta de Happy Circle.',
    family: 'settlement',
    kind: 'navigation',
    featureKey: 'settlements',
    allowedMetadataKeys: ['status'],
  },
  {
    eventName: 'settlement_proposal_approved',
    description: 'El usuario aprobo una propuesta de Happy Circle.',
    family: 'settlement',
    kind: 'outcome',
    featureKey: 'settlements',
    allowedMetadataKeys: ['status', 'source', 'result'],
  },
  {
    eventName: 'settlement_executed',
    description: 'El usuario ejecuto un Happy Circle aprobado.',
    family: 'settlement',
    kind: 'outcome',
    featureKey: 'settlements',
    allowedMetadataKeys: ['status', 'source', 'result'],
  },
] as const satisfies readonly AnalyticsEventCatalogEntry[];

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_CATALOG)[number]['eventName'];

export const ANALYTICS_EVENT_NAMES = [
  'app_opened',
  'app_backgrounded',
  'screen_viewed',
  'registration_started',
  'registration_completed',
  'financial_request_started',
  'financial_request_created',
  'financial_request_accepted',
  'friendship_invite_created',
  'friendship_invite_accepted',
  'settlement_proposal_viewed',
  'settlement_proposal_approved',
  'settlement_executed',
] as const satisfies readonly AnalyticsEventName[];

export const ANALYTICS_SCREEN_NAMES = [
  'activity',
  'auth',
  'balance_overview',
  'circles',
  'home',
  'invite',
  'join',
  'people',
  'person_detail',
  'profile',
  'register',
  'reset_password',
  'setup_account',
  'settlement_detail',
  'transactions',
  'unknown',
] as const;

export type AnalyticsScreenName = (typeof ANALYTICS_SCREEN_NAMES)[number];

const analyticsEventCatalogByName = new Map<AnalyticsEventName, AnalyticsEventCatalogEntry>(
  ANALYTICS_EVENT_CATALOG.map((entry) => [entry.eventName, entry]),
);

export function getAnalyticsEventCatalogEntry(
  eventName: AnalyticsEventName,
): AnalyticsEventCatalogEntry {
  const entry = analyticsEventCatalogByName.get(eventName);
  if (!entry) {
    throw new Error(`Unknown analytics event: ${eventName}`);
  }

  return entry;
}

export function getAllowedAnalyticsMetadataKeys(
  eventName: AnalyticsEventName,
): readonly AnalyticsMetadataKey[] {
  return getAnalyticsEventCatalogEntry(eventName).allowedMetadataKeys;
}

export function isAnalyticsMetadataKeyAllowed(
  eventName: AnalyticsEventName,
  key: string,
): key is AnalyticsMetadataKey {
  return getAllowedAnalyticsMetadataKeys(eventName).includes(key as AnalyticsMetadataKey);
}
