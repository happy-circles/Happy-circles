import { getRelationships } from '@/lib/data';

import { LinkCard } from '@/components/link-card';
import { ScreenShell } from '@/components/screen-shell';

export function RelationshipsScreen() {
  const relationships = getRelationships();

  return (
    <ScreenShell
      title="Relaciones"
      subtitle="Cada pareja de usuarios termina resumida en una sola flecha neta derivada."
    >
      {relationships.map((relationship) => (
        <LinkCard
          key={relationship.userId}
          href={`/relationship/${relationship.userId}`}
          title={relationship.displayName}
          subtitle={
            relationship.direction === 'i_owe'
              ? 'Cuenta abierta donde tu debes'
              : 'Cuenta abierta donde te deben'
          }
        />
      ))}
    </ScreenShell>
  );
}
