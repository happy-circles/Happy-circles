import { StyleSheet, Text, View } from 'react-native';

import { LinkCard } from '@/components/link-card';
import { ScreenShell } from '@/components/screen-shell';
import { StatCard } from '@/components/stat-card';
import { getRelationships, getHomeSummary } from '@/lib/data';
import { theme } from '@/lib/theme';

export function BalanceSummaryScreen() {
  const summary = getHomeSummary();
  const relationships = getRelationships();

  return (
    <ScreenShell title="Balance" subtitle="Proyeccion derivada del ledger confirmado.">
      <StatCard label="Balance neto" amountMinor={summary.netBalanceMinor} />
      <View style={styles.row}>
        <View style={styles.column}>
          <StatCard label="Total debo" amountMinor={summary.totalIOweMinor} />
        </View>
        <View style={styles.column}>
          <StatCard label="Total me deben" amountMinor={summary.totalOwedToMeMinor} />
        </View>
      </View>
      <Text style={styles.sectionTitle}>Personas con cuentas abiertas</Text>
      {relationships.map((relationship) => (
        <LinkCard
          key={relationship.userId}
          href={`/relationship/${relationship.userId}`}
          title={relationship.displayName}
          subtitle={relationship.direction === 'i_owe' ? 'Le debo' : 'Me debe'}
        />
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
});
