import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MoneyHero } from '@/components/money-hero';
import { PendingSnippetCard } from '@/components/pending-snippet-card';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';

function balanceTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function signedAmountLabel(amountMinor: number): string {
  if (amountMinor === 0) {
    return formatCop(0);
  }

  const prefix = amountMinor > 0 ? '+' : '-';
  return `${prefix} ${formatCop(Math.abs(amountMinor))}`;
}

function directionTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function QuickLinkCard({
  description,
  href,
  label,
}: {
  readonly description: string;
  readonly href: Href;
  readonly label: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => [styles.quickLinkCard, pressed ? styles.pressed : null]}>
        <Text style={styles.quickLinkLabel}>{label}</Text>
        <Text style={styles.quickLinkDescription}>{description}</Text>
      </Pressable>
    </Link>
  );
}

function SectionLinkAction({ href, label }: { readonly href: Href; readonly label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => [styles.sectionLinkAction, pressed ? styles.pressed : null]}>
        <Text style={styles.sectionLinkActionText}>{label}</Text>
      </Pressable>
    </Link>
  );
}

function MetricPill({
  label,
  tone,
  value,
}: {
  readonly label: string;
  readonly tone?: 'positive' | 'negative' | 'neutral';
  readonly value: string;
}) {
  return (
    <SurfaceCard padding="sm" style={styles.metricPill} variant="muted">
      <Text style={styles.metricPillLabel}>{label}</Text>
      <Text
        style={[
          styles.metricPillValue,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {value}
      </Text>
    </SurfaceCard>
  );
}

export function BalanceOverviewScreen() {
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const overview = snapshotQuery.data?.balanceOverview ?? null;

  if (snapshotQuery.isLoading || !overview) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="Estamos preparando el resumen de tu balance."
        title="Balance"
      >
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.loadingText}>Cargando tu balance...</Text>
        </SurfaceCard>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="No pudimos cargar el resumen financiero."
        title="Balance"
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  const activeProposal = overview.resolution.activeProposal;
  const projectionTone = directionTone(overview.projection.impactMinor);

  return (
    <ScreenShell
      headerVariant="plain"
      refresh={refresh}
      subtitle="Balance real, proyeccion y resolucion sin mezclar conceptos."
      title="Balance"
    >
      <MoneyHero
        amountMinor={overview.summary.netBalanceMinor}
        badgeLabel={overview.updatedAtLabel}
        caption="Tu balance neto real usa te deben - debes."
        label="Balance neto"
        secondaryMetrics={[
          {
            label: 'Te deben',
            amountMinor: overview.summary.totalOwedToMeMinor,
            tone: 'positive',
          },
          {
            label: 'Debes',
            amountMinor: overview.summary.totalIOweMinor,
            tone: 'negative',
          },
        ]}
        tone={balanceTone(overview.summary.netBalanceMinor)}
      />

      <SectionBlock
        action={<SectionLinkAction href="/transactions" label="Ver pendientes" />}
        subtitle="Los pendientes no cambian tu balance real; solo tu proyeccion."
        title="Proyeccion"
      >
        <PendingSnippetCard
          amountLabel={signedAmountLabel(overview.projection.impactMinor)}
          amountTone={projectionTone === 'positive' ? 'positive' : projectionTone === 'negative' ? 'negative' : 'neutral'}
          detail={`Si todo se confirmara hoy, tu balance proyectado quedaria en ${formatCop(overview.projection.projectedNetBalanceMinor)}.`}
          eyebrow="Pendientes"
          helperText={`${overview.projection.pendingCount} movimiento${overview.projection.pendingCount === 1 ? '' : 's'} por confirmar`}
          meta={
            overview.projection.pendingAmountMinor > 0
              ? `Monto pendiente: ${formatCop(overview.projection.pendingAmountMinor)}`
              : 'Sin monto pendiente'
          }
          statusLabel={overview.projection.pendingCount > 0 ? 'Con impacto' : 'Sin pendientes'}
          statusTone={overview.projection.pendingCount > 0 ? 'warning' : 'neutral'}
          title={
            overview.projection.pendingCount > 0
              ? 'Tu proyeccion puede moverse'
              : 'Tu proyeccion esta en orden'
          }
          tone={overview.projection.pendingCount > 0 ? 'warning' : 'neutral'}
          variant="elevated"
        >
          <PrimaryAction href="/transactions" label="Abrir transacciones" variant="secondary" />
        </PendingSnippetCard>
      </SectionBlock>

      {activeProposal ? (
        <SectionBlock
          subtitle="Happy Circle vive como capa de resolucion y aparece cuando hay una propuesta activa."
          title="Happy Circle"
        >
          <PendingSnippetCard
            amountLabel={formatCop(activeProposal.totalAmountMinor)}
            amountTone="neutral"
            detail={activeProposal.subtitle}
            eyebrow="Resolucion"
            helperText={`${activeProposal.participantCount} participante${activeProposal.participantCount === 1 ? '' : 's'} · ${activeProposal.movementCount} movimiento${activeProposal.movementCount === 1 ? '' : 's'}`}
            meta={
              activeProposal.status === 'approved'
                ? `Ahorra ${activeProposal.savedMovementsCount} movimiento${activeProposal.savedMovementsCount === 1 ? '' : 's'}`
                : `Faltan ${activeProposal.approvalsPending} aprobacion${activeProposal.approvalsPending === 1 ? '' : 'es'}`
            }
            statusLabel={activeProposal.status === 'approved' ? 'Listo' : 'Pendiente'}
            statusTone={activeProposal.status === 'approved' ? 'cycle' : 'warning'}
            title={activeProposal.title}
            tone="cycle"
            variant="elevated"
          >
            <View style={styles.metricPillRow}>
              <MetricPill
                label="Movimientos ahorrados"
                tone="positive"
                value={`${activeProposal.savedMovementsCount}`}
              />
              <MetricPill
                label="Circulos en los que vas"
                value={`${overview.resolution.participatedCount}`}
              />
            </View>
            <PrimaryAction
              href={`/settlements/${activeProposal.proposalId}` as Href}
              label="Ver Happy Circle"
            />
          </PendingSnippetCard>
        </SectionBlock>
      ) : null}

      <SectionBlock
        subtitle="Atajos a la capa analitica para entender el balance sin salir del flujo operativo."
        title="Explora tu balance"
      >
        <View style={styles.quickGrid}>
          <QuickLinkCard
            description="Resumen, comparacion y waterfall del periodo."
            href={'/balance/analytics?segment=summary' as Href}
            label="Resumen"
          />
          <QuickLinkCard
            description="Impacto neto y movimientos por persona visible."
            href={'/balance/analytics?segment=people' as Href}
            label="Personas"
          />
          <QuickLinkCard
            description="Categorias, variacion y personas involucradas."
            href={'/balance/analytics?segment=categories' as Href}
            label="Categorias"
          />
          <QuickLinkCard
            description="Happy Circle activo, ahorro de movimientos e historial."
            href={'/balance/analytics?segment=settlements' as Href}
            label="Cierres"
          />
        </View>
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  quickGrid: {
    gap: theme.spacing.sm,
  },
  quickLinkCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  quickLinkLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  quickLinkDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  sectionLinkAction: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
  },
  sectionLinkActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.9,
  },
  metricPillRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricPill: {
    flex: 1,
    gap: 2,
  },
  metricPillLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  metricPillValue: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  positiveText: {
    color: theme.colors.success,
  },
  negativeText: {
    color: theme.colors.warning,
  },
});
