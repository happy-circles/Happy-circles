import { ListCard } from '@/components/list-card';
import { ScreenShell } from '@/components/screen-shell';
import { getAuditEvents } from '@/lib/data';

export function AuditScreen() {
  const events = getAuditEvents();

  return (
    <ScreenShell title="Auditoria" subtitle="Toda accion critica debe dejar rastro estructurado.">
      {events.map((event) => (
        <ListCard key={event.id} title={event.title} subtitle={event.subtitle} />
      ))}
    </ScreenShell>
  );
}
