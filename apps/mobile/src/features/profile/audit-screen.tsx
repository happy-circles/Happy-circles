import { StyleSheet, Text } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export function ProfileAuditScreen() {
  const snapshotQuery = useAppSnapshot();
  const events = snapshotQuery.data?.auditEvents ?? [];

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell eyebrow="Auditoria" largeTitle={false} subtitle="Cargando eventos recientes del sistema." title="Auditoria">
        <Text style={styles.supportText}>Leyendo auditoria visible para esta cuenta.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell eyebrow="Auditoria" largeTitle={false} subtitle="No pudimos cargar los eventos." title="Auditoria">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      eyebrow="Auditoria"
      largeTitle={false}
      subtitle="Vista tecnica para revisar eventos y trazabilidad del sistema."
      title="Auditoria"
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.summaryTitle}>Linea de tiempo tecnica del sistema.</Text>
        <Text style={styles.summaryBody}>
          Aqui solo ves eventos avanzados, fuera del flujo principal de la app.
        </Text>
      </SurfaceCard>

      <SectionBlock title="Eventos recientes" subtitle="La capa avanzada vive fuera de tabs.">
        {events.length === 0 ? (
          <EmptyState
            description="Cuando esta cuenta genere o afecte eventos auditables, apareceran aqui."
            title="Sin eventos visibles"
          />
        ) : (
          events.map((event) => (
            <SurfaceCard key={event.id} padding="md">
              <Text style={styles.title}>{event.title}</Text>
              <StatusChip label="log" tone="neutral" />
              <Text style={styles.subtitle}>{event.subtitle}</Text>
            </SurfaceCard>
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
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  summaryBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
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
