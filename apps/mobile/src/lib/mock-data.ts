import type {
  ActivitySectionDto,
  DashboardDto,
  PersonCardDto,
  PersonDetailDto,
} from '@happy-circles/application';

export const mockBalanceSummary = {
  netBalanceMinor: 165000,
  totalIOweMinor: 72000,
  totalOwedToMeMinor: 237000,
};

export const mockPeople: readonly PersonCardDto[] = [
  {
    userId: '00000000-0000-0000-0000-0000000000b2',
    displayName: 'Laura',
    direction: 'owes_me',
    netAmountMinor: 120000,
    pendingCount: 1,
    lastActivityLabel: 'Acepto mercado hace 2 horas',
  },
  {
    userId: '00000000-0000-0000-0000-0000000000c3',
    displayName: 'Mateo',
    direction: 'i_owe',
    netAmountMinor: 45000,
    pendingCount: 1,
    lastActivityLabel: 'Te envio una propuesta hoy',
  },
  {
    userId: '00000000-0000-0000-0000-0000000000d4',
    displayName: 'Camila',
    direction: 'owes_me',
    netAmountMinor: 117000,
    pendingCount: 0,
    lastActivityLabel: 'Salida parcial ayer',
  },
];

export const mockDashboard: DashboardDto = {
  summary: mockBalanceSummary,
  urgentCount: 2,
  topPendingPreview: {
    id: 'request-1',
    kind: 'financial_request',
    title: 'Mateo espera tu respuesta',
    subtitle: 'Transporte compartido de anoche.',
    status: 'requires_you',
    ctaLabel: 'Revisar',
    href: '/activity',
    amountMinor: 45000,
  },
  activePeople: mockPeople,
};

export const mockPersonDetails: readonly PersonDetailDto[] = [
  {
    userId: '00000000-0000-0000-0000-0000000000b2',
    displayName: 'Laura',
    direction: 'owes_me',
    netAmountMinor: 120000,
    pendingCount: 1,
    headline: 'Laura te debe',
    supportText: 'Saldo activo.',
    pendingItems: [],
    timeline: [
      {
        id: 'laura-1',
        kind: 'request',
        tone: 'positive',
        title: 'Mercado confirmado',
        subtitle: 'Acepto la propuesta principal.',
        amountMinor: 120000,
        status: 'accepted',
        sourceType: 'user',
        sourceLabel: 'Usuario',
      },
      {
        id: 'laura-2',
        kind: 'settlement',
        tone: 'neutral',
        title: 'Cierre de ciclo del sistema: Laura -> Tu',
        subtitle: 'Sistema | Laura -> Tu | Reduce lo que Laura te debia | hace 2 h',
        amountMinor: 20000,
        status: 'posted',
        sourceType: 'system',
        sourceLabel: 'Sistema',
      },
      {
        id: 'laura-3',
        kind: 'system',
        tone: 'neutral',
        title: 'Historial sincronizado',
        subtitle: 'Ultimo cambio relevante hace 2 horas.',
        amountMinor: 0,
        status: 'info',
        sourceType: 'system',
        sourceLabel: 'Sistema',
      },
    ],
  },
  {
    userId: '00000000-0000-0000-0000-0000000000c3',
    displayName: 'Mateo',
    direction: 'i_owe',
    netAmountMinor: 45000,
    pendingCount: 1,
    headline: 'Tu le debes a Mateo',
    supportText: 'Falta responder una propuesta.',
    pendingItems: [],
    timeline: [
      {
        id: 'mateo-1',
        kind: 'request',
        tone: 'negative',
        title: 'Transporte por confirmar',
        subtitle: 'Mateo envio la propuesta y espera tu aprobacion.',
        amountMinor: 45000,
        status: 'pending',
        sourceType: 'user',
        sourceLabel: 'Usuario',
      },
      {
        id: 'mateo-2',
        kind: 'payment',
        tone: 'positive',
        title: 'Salida registrada',
        subtitle: 'Redujiste una parte del saldo la semana pasada.',
        amountMinor: 15000,
        status: 'posted',
        sourceType: 'user',
        sourceLabel: 'Usuario',
      },
    ],
  },
  {
    userId: '00000000-0000-0000-0000-0000000000d4',
    displayName: 'Camila',
    direction: 'owes_me',
    netAmountMinor: 117000,
    pendingCount: 0,
    headline: 'Camila te debe',
    supportText: 'Sin urgencias.',
    pendingItems: [],
    timeline: [
      {
        id: 'camila-1',
        kind: 'payment',
        tone: 'positive',
        title: 'Entrada parcial recibida',
        subtitle: 'Redujo el saldo pendiente ayer.',
        amountMinor: 30000,
        status: 'posted',
        sourceType: 'user',
        sourceLabel: 'Usuario',
      },
      {
        id: 'camila-2',
        kind: 'request',
        tone: 'positive',
        title: 'Cena compartida aceptada',
        subtitle: 'Movimiento confirmado y visible en el saldo.',
        amountMinor: 147000,
        status: 'accepted',
        sourceType: 'user',
        sourceLabel: 'Usuario',
      },
    ],
  },
];

export const mockActivitySections: readonly ActivitySectionDto[] = [
  {
    key: 'pending',
    title: 'Pendientes',
    description: 'Todo lo que espera accion tuya o de otra persona.',
    emptyMessage: 'No hay pendientes por ahora.',
    items: [
      {
        id: 'activity-request-1',
        kind: 'financial_request',
        title: 'Mateo te envio una salida propuesta',
        subtitle: 'COP 45.000 por transporte compartido.',
        status: 'requires_you',
        href: '/activity',
        amountMinor: 45000,
      },
      {
        id: 'activity-settlement-1',
        kind: 'settlement_proposal',
        title: 'Cierre sugerido entre Laura, Mateo y tu',
        subtitle: 'Solo falta tu aprobacion para continuar.',
        status: 'pending_approvals',
        href: '/settlements/settlement-1',
        amountMinor: 20000,
      },
    ],
  },
  {
    key: 'history',
    title: 'Historial',
    description: 'Lo ultimo confirmado y registrado.',
    emptyMessage: 'Aun no hay historial.',
    items: [
      {
        id: 'history-1',
        kind: 'accepted_request',
        title: 'Laura acepto una propuesta',
        subtitle: 'Mercado del fin de semana.',
        status: 'accepted',
        href: '/person/00000000-0000-0000-0000-0000000000b2',
        amountMinor: 120000,
        sourceType: 'user',
      },
      {
        id: 'history-2',
        kind: 'manual_payment',
        title: 'Camila registro una entrada',
        subtitle: 'Reduccion parcial al saldo abierto.',
        status: 'posted',
        href: '/person/00000000-0000-0000-0000-0000000000d4',
        amountMinor: 30000,
        sourceType: 'user',
      },
      {
        id: 'history-3',
        kind: 'system_note',
        title: 'Cierre de ciclo del sistema: Mateo -> Laura',
        subtitle: 'Sistema | Mateo -> Laura | Ajusta saldo neto dentro del circulo.',
        status: 'info',
        href: '/settlements/settlement-1',
        amountMinor: 0,
        sourceType: 'system',
      },
    ],
  },
];

export const mockSettlement = {
  id: 'settlement-1',
  status: 'pending_approvals',
  snapshotHash: 'settle_20260407_abc123',
  participants: ['Tu', 'Laura', 'Mateo'],
  participantStatuses: ['Tu: pending', 'Laura: pending', 'Mateo: pending'],
  impactLines: [
    'Ajusta el saldo neto Laura -> Tu en COP 20.000',
    'Ajusta el saldo neto Tu -> Mateo en COP 20.000',
    'Ajusta el saldo neto Mateo -> Laura en COP 20.000',
  ],
  movements: [
    'Laura -> Tu: COP 20.000',
    'Tu -> Mateo: COP 20.000',
    'Mateo -> Laura: COP 20.000',
  ],
  explainers: [
    'El cierre solo aparece porque las tres personas ya tienen saldos confirmados.',
    'No cambia historia previa: solo propone los siguientes movimientos.',
  ],
};

export const mockAudit = [
  {
    id: 'audit-1',
        title: 'Propuesta aceptada',
        subtitle: 'Laura acepto el movimiento de mercado.',
  },
  {
    id: 'audit-2',
    title: 'Settlement proposed',
    subtitle: 'Se detecto un circulo elegible para cierre.',
  },
  {
    id: 'audit-3',
    title: 'Reminder scheduled',
    subtitle: 'Se programo un recordatorio diario para pendientes.',
  },
];
