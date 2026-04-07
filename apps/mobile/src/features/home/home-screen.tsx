import { StyleSheet, View } from 'react-native';

import { LinkCard } from '@/components/link-card';
import { ScreenShell } from '@/components/screen-shell';
import { StatCard } from '@/components/stat-card';
import { getHomeSummary } from '@/lib/data';

export function HomeScreen() {
  const summary = getHomeSummary();

  return (
    <ScreenShell
      title="Inicio"
      subtitle="Todo parte de requests confirmados, ledger inmutable y una sola flecha neta por pareja."
    >
      <View style={styles.grid}>
        <StatCard label="Balance neto" amountMinor={summary.netBalanceMinor} />
        <StatCard label="Total debo" amountMinor={summary.totalIOweMinor} />
        <StatCard label="Total me deben" amountMinor={summary.totalOwedToMeMinor} />
      </View>
      <LinkCard href="/balances" title="Balance resumen" subtitle="Ver neto, debo, me deben y relaciones." />
      <LinkCard href="/relationships" title="Relaciones" subtitle="Abrir cuenta bilateral por persona." />
      <LinkCard href="/inbox" title="Inbox" subtitle="Requests pendientes, contraofertas y propuestas de circulo." />
      <LinkCard href="/requests/new" title="Crear request" subtitle="Registrar una deuda o un cierre manual externo." />
      <LinkCard href="/audit" title="Auditoria" subtitle="Ver actividad financiera y de sistema." />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
  },
});
