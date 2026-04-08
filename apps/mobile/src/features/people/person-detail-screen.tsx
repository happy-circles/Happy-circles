import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MoneyHero } from '@/components/money-hero';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export interface PersonDetailScreenProps {
  readonly userId: string;
}

export function PersonDetailScreen({ userId }: PersonDetailScreenProps) {
  const snapshotQuery = useAppSnapshot();
  const person = snapshotQuery.data?.peopleById[userId] ?? null;

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell largeTitle={false} title="Persona" subtitle="Cargando esta relacion.">
        <Text style={styles.supportText}>Estamos leyendo el saldo y el historial real.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell largeTitle={false} title="Persona" subtitle="No pudimos cargar esta relacion.">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (!person) {
    return (
      <ScreenShell largeTitle={false} title="Persona" subtitle="No encontramos esta relacion.">
        <EmptyState
          title="Sin relacion activa"
          description="Prueba desde la lista principal de personas o confirma que la relacion exista en Supabase."
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      footer={
        <View style={styles.footerActions}>
          <PrimaryAction href="/register" label="Registrar deuda" />
        </View>
      }
      largeTitle={false}
      subtitle={person.supportText}
      title={person.displayName}
    >
      <MoneyHero
        amountMinor={person.netAmountMinor}
        badgeLabel={
          person.netAmountMinor === 0 ? 'Al dia' : person.direction === 'owes_me' ? 'Te debe' : 'Debes'
        }
        caption={person.headline}
        label="Saldo actual"
        tone={
          person.netAmountMinor === 0
            ? 'neutral'
            : person.direction === 'owes_me'
              ? 'positive'
              : 'negative'
        }
      />

      <SectionBlock title="Historial" subtitle="Todo lo que afecta o explica esta cuenta.">
        {person.timeline.length === 0 ? (
          <EmptyState
            title="Sin movimientos todavia"
            description="Cuando haya requests o movimientos confirmados con esta persona, apareceran aqui."
          />
        ) : (
          person.timeline.map((item) => (
            <View key={item.id} style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <View style={styles.timelineText}>
                  <Text style={styles.timelineTitle}>{item.title}</Text>
                  <Text style={styles.timelineSubtitle}>{item.subtitle}</Text>
                </View>
                <StatusChip
                  label={item.status}
                  tone={
                    item.tone === 'positive'
                      ? 'success'
                      : item.tone === 'negative'
                        ? 'warning'
                        : 'neutral'
                  }
                />
              </View>
              <Text
                style={[
                  styles.timelineAmount,
                  item.tone === 'positive' ? styles.positive : null,
                  item.tone === 'negative' ? styles.negative : null,
                ]}
              >
                {item.amountMinor === 0 ? 'Sin monto' : formatCop(item.amountMinor)}
              </Text>
            </View>
          ))
        )}
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  timelineCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  timelineHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  timelineText: {
    flex: 1,
    gap: 3,
  },
  timelineTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  timelineSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  timelineAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
  footerActions: {
    flexDirection: 'row',
  },
});
