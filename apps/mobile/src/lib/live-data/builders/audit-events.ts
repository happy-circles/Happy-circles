import type { AuditEventRow, AuditListItem } from '../types';
import { formatRelativeLabel } from '../utils/dates';

export function buildAuditItems(events: readonly AuditEventRow[], nowMs: number): AuditListItem[] {
  return events.map((event) => ({
    id: event.id,
    title: event.event_name.replaceAll('_', ' '),
    subtitle: `${event.entity_type} | ${formatRelativeLabel(event.created_at, nowMs)}`,
  }));
}
