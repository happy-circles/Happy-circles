import type { ActivityItemDto, ActivitySectionDto } from '@happy-circles/application';

export const LIVE_DATA_CTA = {
  complete: 'Completar',
  respond: 'Responder',
  review: 'Revisar',
  share: 'Compartir',
  verify: 'Verificar',
  view: 'Ver',
  qrActive: 'QR activo',
} as const;

export const LIVE_DATA_ROUTES = {
  activity: '/activity',
  friendshipActivity: '/activity?domain=friendships',
  inviteProfile: (userId: string, panel: string, inviteId: string) =>
    `/person/${encodeURIComponent(userId)}?panel=${panel}&focus=${encodeURIComponent(inviteId)}`,
  person: (userId: string) => `/person/${userId}`,
  settlement: (proposalId: string) => `/settlements/${proposalId}`,
} as const;

export function buildActivitySections(input: {
  readonly pendingItems: readonly ActivityItemDto[];
  readonly historyItems: readonly ActivityItemDto[];
}): ActivitySectionDto[] {
  return [
    {
      key: 'pending',
      title: 'Pendientes',
      description: 'Todo lo que espera acción tuya ahora mismo.',
      emptyMessage: 'No hay pendientes por ahora.',
      items: input.pendingItems,
    },
    {
      key: 'history',
      title: 'Historial',
      description: 'Lo ultimo que ya quedo registrado en el ledger o resuelto.',
      emptyMessage: 'Aun no hay historial.',
      items: input.historyItems,
    },
  ];
}
