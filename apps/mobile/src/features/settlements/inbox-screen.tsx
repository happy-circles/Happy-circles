import { LinkCard } from '@/components/link-card';
import { ScreenShell } from '@/components/screen-shell';
import { getInboxItems } from '@/lib/data';

export function InboxScreen() {
  const items = getInboxItems();

  return (
    <ScreenShell
      title="Inbox"
      subtitle="Un solo lugar para requests pendientes, contraofertas y ciclos detectados."
    >
      {items.map((item) =>
        item.kind === 'settlement_proposal' ? (
          <LinkCard
            key={item.id}
            href={`/settlements/${item.id}`}
            title={item.title}
            subtitle={item.subtitle}
          />
        ) : (
          <LinkCard key={item.id} href="/requests/new" title={item.title} subtitle={item.subtitle} />
        ),
      )}
    </ScreenShell>
  );
}
