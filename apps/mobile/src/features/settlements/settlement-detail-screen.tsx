import { ListCard } from '@/components/list-card';
import { ScreenShell } from '@/components/screen-shell';
import { getSettlementDetail } from '@/lib/data';

export interface SettlementDetailScreenProps {
  readonly proposalId: string;
}

export function SettlementDetailScreen({ proposalId }: SettlementDetailScreenProps) {
  const settlement = getSettlementDetail();

  return (
    <ScreenShell
      title={`Propuesta ${proposalId}`}
      subtitle="Snapshot del grafo, aprobaciones requeridas y movimientos de sistema propuestos."
    >
      <ListCard title="Estado" subtitle={settlement.status} />
      <ListCard title="Snapshot hash" subtitle={settlement.snapshotHash} />
      <ListCard title="Participantes" subtitle={settlement.participants.join(', ')} />
      <ListCard title="Movimientos" subtitle={settlement.movements.join('\n')} />
    </ScreenShell>
  );
}
