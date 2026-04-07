export const mockBalanceSummary = {
  netBalanceMinor: 165000,
  totalIOweMinor: 72000,
  totalOwedToMeMinor: 237000,
};

export const mockRelationships = [
  {
    userId: '00000000-0000-0000-0000-0000000000b2',
    displayName: 'Laura',
    direction: 'owes_me' as const,
    netAmountMinor: 120000,
  },
  {
    userId: '00000000-0000-0000-0000-0000000000c3',
    displayName: 'Mateo',
    direction: 'i_owe' as const,
    netAmountMinor: 45000,
  },
  {
    userId: '00000000-0000-0000-0000-0000000000d4',
    displayName: 'Camila',
    direction: 'owes_me' as const,
    netAmountMinor: 117000,
  },
];

export const mockRelationshipHistory = [
  {
    id: 'req-1',
    kind: 'request',
    title: 'Deuda aceptada: mercado',
    subtitle: 'Laura acepto que te debe',
    amountMinor: 120000,
  },
  {
    id: 'set-1',
    kind: 'system',
    title: 'Propuesta de circulo ejecutada',
    subtitle: 'Movimiento generado por el sistema',
    amountMinor: 30000,
  },
];

export const mockInboxItems = [
  {
    id: 'request-1',
    kind: 'financial_request' as const,
    title: 'Mateo te envio una deuda',
    subtitle: 'COP 45.000 por transporte',
    status: 'pending',
  },
  {
    id: 'settlement-1',
    kind: 'settlement_proposal' as const,
    title: 'Cierre de circulo disponible',
    subtitle: 'Afecta a Laura, Mateo y tu',
    status: 'pending_approvals',
  },
];

export const mockSettlement = {
  id: 'settlement-1',
  status: 'pending_approvals',
  snapshotHash: 'abc123',
  participants: ['Tu', 'Laura', 'Mateo'],
  movements: [
    'Laura -> Tu: COP 20.000',
    'Mateo -> Laura: COP 20.000',
    'Tu -> Mateo: COP 20.000',
  ],
};

export const mockAudit = [
  {
    id: 'audit-1',
    title: 'Financial request accepted',
    subtitle: 'Laura acepto mercado',
  },
  {
    id: 'audit-2',
    title: 'Settlement proposed',
    subtitle: 'Se detecto un circulo A -> B -> C -> A',
  },
];
