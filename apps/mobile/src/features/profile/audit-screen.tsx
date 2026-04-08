import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export function ProfileAuditScreen() {
  const snapshotQuery = useAppSnapshot();
  const events = snapshotQuery.data?.auditEvents ?? [];

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell
        largeTitle={false}
        title="Auditoria"
        subtitle="Cargando eventos recientes del sistema."
      >
        <Text style={styles.supportText}>Leyendo auditoria visible para esta cuenta.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        largeTitle={false}
        title="Auditoria"
        subtitle="No pudimos cargar los eventos."
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      largeTitle={false}
      title="Auditoria"
      subtitle="Vista tecnica para revisar eventos y trazabilidad del sistema."
    >
      <SectionBlock title="Eventos recientes" subtitle="La capa avanzada vive fuera de tabs.">
        {events.length === 0 ? (
          <EmptyState
            title="Sin eventos visibles"
            description="Cuando esta cuenta genere o afecte eventos auditables, apareceran aqui."
          />
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>{event.title}</Text>
                <StatusChip label="log" tone="neutral" />
              </View>
              <Text style={styles.subtitle}>{event.subtitle}</Text>
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
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
});
