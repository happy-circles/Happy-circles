import { StyleSheet, Text } from 'react-native';

import { ListCard } from '@/components/list-card';
import { ScreenShell } from '@/components/screen-shell';
import { getRelationshipHistory, getRelationships } from '@/lib/data';
import { theme } from '@/lib/theme';

export interface RelationshipDetailScreenProps {
  readonly userId: string;
}

export function RelationshipDetailScreen({ userId }: RelationshipDetailScreenProps) {
  const relationship = getRelationships().find((item) => item.userId === userId) ?? getRelationships()[0];
  if (!relationship) {
    return <ScreenShell title="Cuenta no encontrada" subtitle="No encontramos esa relacion." />;
  }

  const history = getRelationshipHistory();

  return (
    <ScreenShell
      title={`Cuenta con ${relationship.displayName}`}
      subtitle="Historial completo, separando movimiento humano y movimiento del sistema."
    >
      <Text style={styles.netLabel}>
        {relationship.direction === 'i_owe' ? 'Le debes' : 'Te debe'} {relationship.displayName}
      </Text>
      <Text style={styles.netAmount}>COP {(relationship.netAmountMinor / 100).toLocaleString('es-CO')}</Text>
      {history.map((item) => (
        <ListCard
          key={item.id}
          title={item.title}
          subtitle={item.subtitle}
          trailing={`COP ${(item.amountMinor / 100).toLocaleString('es-CO')}`}
        />
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  netLabel: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  netAmount: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
});
