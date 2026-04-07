import {
  mockAudit,
  mockBalanceSummary,
  mockInboxItems,
  mockRelationshipHistory,
  mockRelationships,
  mockSettlement,
} from './mock-data';

export function formatCop(amountMinor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function getHomeSummary() {
  return mockBalanceSummary;
}

export function getRelationships() {
  return mockRelationships;
}

export function getRelationshipHistory() {
  return mockRelationshipHistory;
}

export function getInboxItems() {
  return mockInboxItems;
}

export function getSettlementDetail() {
  return mockSettlement;
}

export function getAuditEvents() {
  return mockAudit;
}
