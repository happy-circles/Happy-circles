import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HappyCircleCard } from '@/components/happy-circle-card';
import { MoneyHero } from '@/components/money-hero';
import { PrimaryAction } from '@/components/primary-action';
import { ProjectionForecastCard } from '@/components/projection-forecast-card';
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

function AnalyticsTeaserCard({
  href,
  icon,
  label,
}: {
  readonly href: Href;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => [styles.analyticsTeaserCard, pressed ? styles.pressed : null]}>
        <View style={styles.teaserIconBox}>
          <Ionicons color={theme.colors.primary} name={icon} size={22} />
        </View>
        <View>
          <Text style={styles.analyticsTeaserLabel}>{label}</Text>
        </View>
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
      title="Balance"
    >
      <MoneyHero
        amountMinor={overview.summary.netBalanceMinor}
        badgeLabel={overview.updatedAtLabel}
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
        title="Proyeccion"
      >
        <ProjectionForecastCard
          currentBalanceMinor={overview.summary.netBalanceMinor}
          impactMinor={overview.projection.impactMinor}
          pendingCount={overview.projection.pendingCount}
          pendingIncomingMinor={overview.projection.pendingIncomingMinor}
          pendingOutgoingMinor={overview.projection.pendingOutgoingMinor}
          projectedBalanceMinor={overview.projection.projectedNetBalanceMinor}
          totalIOweMinor={overview.summary.totalIOweMinor}
          totalOwedToMeMinor={overview.summary.totalOwedToMeMinor}
        />
        <View style={{ marginTop: 12 }}>
          <PrimaryAction href="/transactions" label="Abrir transacciones" variant="secondary" />
        </View>
      </SectionBlock>

      {activeProposal ? (
        <SectionBlock title="Happy Circle">
          <HappyCircleCard proposal={activeProposal} />
        </SectionBlock>
      ) : null}

      <SectionBlock title="Explora tu balance">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.analyticsRail}
        >
          <AnalyticsTeaserCard
            href={'/balance/analytics?segment=summary' as Href}
            icon="stats-chart"
            label="Resumen"
          />
          <AnalyticsTeaserCard
            href={'/balance/analytics?segment=people' as Href}
            icon="people"
            label="Personas"
          />
          <AnalyticsTeaserCard
            href={'/balance/analytics?segment=categories' as Href}
            icon="pricetags"
            label="Categorias"
          />
          <AnalyticsTeaserCard
            href={'/balance/analytics?segment=settlements' as Href}
            icon="sync-circle"
            label="Cierres"
          />
        </ScrollView>
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
  analyticsRail: {
    gap: theme.spacing.md,
    paddingRight: theme.spacing.xl,
  },
  analyticsTeaserCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    padding: theme.spacing.md,
    width: 140,
  },
  teaserIconBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.medium,
    height: 44,
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    width: 44,
  },
  analyticsTeaserLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
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
