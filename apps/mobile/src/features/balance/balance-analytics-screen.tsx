import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
  BalanceAnalyticsPersonRowDto,
} from '@happy-circles/application';

import { PendingSnippetCard } from '@/components/pending-snippet-card';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryLabel } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';

type AnalyticsSegment = 'summary' | 'people' | 'categories' | 'settlements';

const SEGMENT_OPTIONS: readonly SegmentedOption<AnalyticsSegment>[] = [
  { label: 'Resumen', value: 'summary' },
  { label: 'Personas', value: 'people' },
  { label: 'Categorias', value: 'categories' },
  { label: 'Cierres', value: 'settlements' },
];

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Ano', value: 'year' },
  { label: 'Todo', value: 'all' },
];

const LENS_OPTIONS: readonly SegmentedOption<BalanceAnalyticsLens>[] = [
  { label: 'Balance', value: 'balance' },
  { label: 'Debes', value: 'i_owe' },
  { label: 'Te deben', value: 'owed_to_me' },
];

function isAnalyticsSegment(value: string | null | undefined): value is AnalyticsSegment {
  return value === 'summary' || value === 'people' || value === 'categories' || value === 'settlements';
}

function amountTone(amountMinor: number): 'positive' | 'negative' | 'neutral' {
  if (amountMinor > 0) {
    return 'positive';
  }

  if (amountMinor < 0) {
    return 'negative';
  }

  return 'neutral';
}

function comparisonCopy(changeRatio: number | null, previousLabel: string | null): string {
  if (changeRatio === null || !previousLabel) {
    return 'Sin comparacion disponible.';
  }

  const percentage = `${Math.round(Math.abs(changeRatio) * 100)}%`;
  if (changeRatio === 0) {
    return `Sin cambio frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
  }

  return changeRatio > 0
    ? `Subio ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`
    : `Bajo ${percentage} frente a ${previousLabel.toLocaleLowerCase('es-CO')}.`;
}

function personLensAmount(
  row: BalanceAnalyticsPersonRowDto,
  lens: BalanceAnalyticsLens,
): number {
  if (lens === 'i_owe') {
    return row.periodIOweMinor;
  }

  if (lens === 'owed_to_me') {
    return row.periodOwedToMeMinor;
  }

  return row.periodNetMinor;
}

function categoryLensAmount(
  row: BalanceAnalyticsCategoryRowDto,
  lens: BalanceAnalyticsLens,
): number {
  if (lens === 'i_owe') {
    return row.iOweMinor;
  }

  if (lens === 'owed_to_me') {
    return row.owedToMeMinor;
  }

  return row.netMinor;
}

function WaterfallRow({
  amountMinor,
  label,
  tone,
}: {
  readonly amountMinor: number;
  readonly label: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <View style={styles.waterfallRow}>
      <View
        style={[
          styles.waterfallBar,
          tone === 'positive' ? styles.barPositive : null,
          tone === 'negative' ? styles.barNegative : null,
          tone === 'neutral' ? styles.barNeutral : null,
          { width: `${Math.max(16, Math.min(Math.abs(amountMinor) / 400, 100))}%` },
        ]}
      />
      <View style={styles.waterfallCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text
          style={[
            styles.rowAmount,
            tone === 'positive' ? styles.positiveText : null,
            tone === 'negative' ? styles.negativeText : null,
          ]}
        >
          {formatCop(amountMinor)}
        </Text>
      </View>
    </View>
  );
}

function RankingRow({
  description,
  label,
  meta,
  onPress,
  tone,
  valueLabel,
}: {
  readonly description?: string | null;
  readonly label: string;
  readonly meta: string;
  readonly onPress: () => void;
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly valueLabel: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.rankingRow, pressed ? styles.pressed : null]}>
      <View style={styles.rankingCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>
      <Text
        style={[
          styles.rowAmount,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {valueLabel}
      </Text>
    </Pressable>
  );
}

function DetailSheet({
  children,
  onClose,
  title,
  visible,
}: {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly title: string;
  readonly visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface BalanceAnalyticsScreenProps {
  readonly initialSegment?: string | null;
}

export function BalanceAnalyticsScreen({ initialSegment }: BalanceAnalyticsScreenProps) {
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useState<BalanceAnalyticsPeriod>(
    analytics?.defaultPeriod ?? 'month',
  );
  const [lens, setLens] = useState<BalanceAnalyticsLens>('balance');
  const [segment, setSegment] = useState<AnalyticsSegment>(
    isAnalyticsSegment(initialSegment) ? initialSegment : 'summary',
  );
  const [selectedPerson, setSelectedPerson] = useState<BalanceAnalyticsPersonRowDto | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<BalanceAnalyticsCategoryRowDto | null>(
    null,
  );

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="Estamos preparando la capa analitica."
        title="Analitica"
      >
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.loadingText}>Cargando analitica...</Text>
        </SurfaceCard>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="No pudimos cargar los agregados del balance."
        title="Analitica"
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const lensSummary = currentPeriod.summaries[lens];
  const sortedPeople = useMemo(
    () =>
      [...currentPeriod.people].sort((left, right) => {
        const amountDiff = Math.abs(personLensAmount(right, lens)) - Math.abs(personLensAmount(left, lens));
        if (amountDiff !== 0) {
          return amountDiff;
        }

        if (right.movementCount !== left.movementCount) {
          return right.movementCount - left.movementCount;
        }

        return left.label.localeCompare(right.label, 'es-CO');
      }),
    [currentPeriod.people, lens],
  );
  const sortedCategories = useMemo(
    () =>
      [...currentPeriod.categories].sort((left, right) => {
        const amountDiff =
          Math.abs(categoryLensAmount(right, lens)) - Math.abs(categoryLensAmount(left, lens));
        if (amountDiff !== 0) {
          return amountDiff;
        }

        if (right.movementCount !== left.movementCount) {
          return right.movementCount - left.movementCount;
        }

        return left.label.localeCompare(right.label, 'es-CO');
      }),
    [currentPeriod.categories, lens],
  );
  const settlementPreview = currentPeriod.settlements.activeProposal;

  return (
    <ScreenShell
      headerVariant="plain"
      refresh={refresh}
      subtitle="Comparaciones, personas, categorias y cierres desde una sola capa de lectura."
      title="Analitica"
    >
      <SectionBlock subtitle="Filtros globales que recalculan todas las vistas." title="Vista">
        <SegmentedControl options={PERIOD_OPTIONS} onChange={setPeriod} value={period} />
        <SegmentedControl options={LENS_OPTIONS} onChange={setLens} value={lens} />
        <SegmentedControl options={SEGMENT_OPTIONS} onChange={setSegment} value={segment} />
      </SectionBlock>

      {segment === 'summary' ? (
        <>
          <SectionBlock subtitle={currentPeriod.labels.current} title="Resumen del periodo">
            <SurfaceCard padding="lg" variant="elevated">
              <Text style={styles.heroEyebrow}>{currentPeriod.labels.current}</Text>
              <Text style={styles.heroAmount}>{formatCop(lensSummary.finalMinor)}</Text>
              <Text style={styles.heroCaption}>
                Inicio: {formatCop(lensSummary.initialMinor)} · Cambio del periodo:{' '}
                {formatCop(lensSummary.deltaMinor)}
              </Text>
              <Text style={styles.heroInsight}>
                {comparisonCopy(lensSummary.changeRatio, currentPeriod.labels.previous)}
              </Text>
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock
            subtitle="Lectura por pasos del saldo inicial al balance final."
            title="Waterfall"
          >
            <SurfaceCard padding="md">
              {currentPeriod.waterfall.map((step) => (
                <WaterfallRow
                  amountMinor={step.netMinor}
                  key={step.key}
                  label={step.label}
                  tone={amountTone(step.netMinor)}
                />
              ))}
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock subtitle="Una lectura corta para explicar el periodo." title="Insight">
            <SurfaceCard padding="md" variant="muted">
              <Text style={styles.insightText}>{currentPeriod.insight}</Text>
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock subtitle="Atajos a las dimensiones principales." title="Teasers">
            <View style={styles.quickTeasers}>
              {sortedPeople[0] ? (
                <SurfaceCard padding="md" style={styles.teaserCard}>
                  <Text style={styles.teaserTitle}>Persona con mayor impacto</Text>
                  <Text style={styles.rowTitle}>{sortedPeople[0].label}</Text>
                  <Text style={styles.rowMeta}>
                    {sortedPeople[0].movementCount} movimiento
                    {sortedPeople[0].movementCount === 1 ? '' : 's'} ·{' '}
                    {formatCop(personLensAmount(sortedPeople[0], lens))}
                  </Text>
                </SurfaceCard>
              ) : null}
              {sortedCategories[0] ? (
                <SurfaceCard padding="md" style={styles.teaserCard}>
                  <Text style={styles.teaserTitle}>Categoria con mayor impacto</Text>
                  <Text style={styles.rowTitle}>{sortedCategories[0].label}</Text>
                  <Text style={styles.rowMeta}>
                    {sortedCategories[0].movementCount} movimiento
                    {sortedCategories[0].movementCount === 1 ? '' : 's'} ·{' '}
                    {formatCop(categoryLensAmount(sortedCategories[0], lens))}
                  </Text>
                </SurfaceCard>
              ) : null}
            </View>
          </SectionBlock>
        </>
      ) : null}

      {segment === 'people' ? (
        <SectionBlock
          subtitle="Solo personas visibles para ti, ordenadas por impacto absoluto."
          title="Por persona"
        >
          <SurfaceCard padding="md">
            {sortedPeople.length === 0 ? (
              <Text style={styles.supportText}>Todavia no hay actividad visible en este periodo.</Text>
            ) : (
              sortedPeople.map((row) => (
                <RankingRow
                  description={
                    row.topCategories.length > 0
                      ? row.topCategories.map((category) => transactionCategoryLabel(category)).join(', ')
                      : 'Sin categorias dominantes'
                  }
                  key={row.key}
                  label={row.label}
                  meta={`${row.movementCount} movimiento${row.movementCount === 1 ? '' : 's'} · saldo actual ${formatCop(row.netMinor)}`}
                  onPress={() => setSelectedPerson(row)}
                  tone={amountTone(personLensAmount(row, lens))}
                  valueLabel={formatCop(personLensAmount(row, lens))}
                />
              ))
            )}
          </SurfaceCard>
        </SectionBlock>
      ) : null}

      {segment === 'categories' ? (
        <SectionBlock
          subtitle="Impacto por categoria sin exponer relaciones no visibles."
          title="Por categoria"
        >
          <SurfaceCard padding="md">
            {sortedCategories.length === 0 ? (
              <Text style={styles.supportText}>Todavia no hay categorias con impacto en este periodo.</Text>
            ) : (
              sortedCategories.map((row) => (
                <RankingRow
                  description={
                    row.personLabels.length > 0
                      ? row.personLabels.join(', ')
                      : 'Sin personas visibles en este periodo'
                  }
                  key={row.key}
                  label={row.label}
                  meta={`${row.movementCount} movimiento${row.movementCount === 1 ? '' : 's'} · ${comparisonCopy(
                    row.previousNetMinor === 0
                      ? null
                      : (row.netMinor - row.previousNetMinor) / Math.abs(row.previousNetMinor),
                    currentPeriod.labels.previous,
                  )}`}
                  onPress={() => setSelectedCategory(row)}
                  tone={amountTone(categoryLensAmount(row, lens))}
                  valueLabel={formatCop(categoryLensAmount(row, lens))}
                />
              ))
            )}
          </SurfaceCard>
        </SectionBlock>
      ) : null}

      {segment === 'settlements' ? (
        <>
          {settlementPreview ? (
            <SectionBlock subtitle="Entrada contextual a la propuesta activa." title="Happy Circle activo">
              <PendingSnippetCard
                amountLabel={formatCop(settlementPreview.totalAmountMinor)}
                amountTone="neutral"
                detail={settlementPreview.subtitle}
                eyebrow="Happy Circle"
                helperText={`${settlementPreview.participantCount} participante${settlementPreview.participantCount === 1 ? '' : 's'} · ${settlementPreview.savedMovementsCount} movimiento${settlementPreview.savedMovementsCount === 1 ? '' : 's'} ahorrado${settlementPreview.savedMovementsCount === 1 ? '' : 's'}`}
                meta={settlementPreview.participantLabels.join(', ')}
                statusLabel={settlementPreview.status === 'approved' ? 'Listo' : 'Pendiente'}
                statusTone={settlementPreview.status === 'approved' ? 'cycle' : 'warning'}
                title={settlementPreview.title}
                tone="cycle"
                variant="elevated"
              >
                <PrimaryAction
                  href={`/settlements/${settlementPreview.proposalId}` as Href}
                  label="Abrir Happy Circle"
                />
              </PendingSnippetCard>
            </SectionBlock>
          ) : null}

          <SectionBlock
            subtitle="Historico de resolucion sin mezclarlo con la composicion del balance."
            title="Metricas de cierres"
          >
            <View style={styles.quickTeasers}>
              <SurfaceCard padding="md" style={styles.teaserCard}>
                <Text style={styles.teaserTitle}>Monto resuelto</Text>
                <Text style={styles.rowAmount}>{formatCop(currentPeriod.settlements.resolvedMinor)}</Text>
                <Text style={styles.rowMeta}>
                  {comparisonCopy(
                    currentPeriod.settlements.changeRatio,
                    currentPeriod.labels.previous,
                  )}
                </Text>
              </SurfaceCard>
              <SurfaceCard padding="md" style={styles.teaserCard}>
                <Text style={styles.teaserTitle}>Movimientos ahorrados</Text>
                <Text style={styles.rowAmount}>{currentPeriod.settlements.savedMovementsCount}</Text>
                <Text style={styles.rowMeta}>
                  {currentPeriod.settlements.movementCount} movimiento
                  {currentPeriod.settlements.movementCount === 1 ? '' : 's'} ejecutado
                  {currentPeriod.settlements.movementCount === 1 ? '' : 's'}
                </Text>
              </SurfaceCard>
              <SurfaceCard padding="md" style={styles.teaserCard}>
                <Text style={styles.teaserTitle}>Circulos participados</Text>
                <Text style={styles.rowAmount}>{currentPeriod.settlements.participatedCount}</Text>
                <Text style={styles.rowMeta}>
                  {currentPeriod.settlements.activeCount} activo
                  {currentPeriod.settlements.activeCount === 1 ? '' : 's'} hoy
                </Text>
              </SurfaceCard>
            </View>
          </SectionBlock>
        </>
      ) : null}

      <DetailSheet
        onClose={() => setSelectedPerson(null)}
        title={selectedPerson?.label ?? 'Persona'}
        visible={Boolean(selectedPerson)}
      >
        {selectedPerson ? (
          <>
            <SurfaceCard padding="md" variant="elevated">
              <Text style={styles.heroEyebrow}>Relacion actual</Text>
              <Text style={styles.heroAmount}>{formatCop(selectedPerson.netMinor)}</Text>
              <Text style={styles.heroCaption}>
                Te deben {formatCop(selectedPerson.owedToMeMinor)} · Debes {formatCop(selectedPerson.iOweMinor)}
              </Text>
            </SurfaceCard>
            <SurfaceCard padding="md">
              <Text style={styles.rowTitle}>Lectura del periodo</Text>
              <Text style={styles.rowDescription}>
                Impacto: {formatCop(selectedPerson.periodNetMinor)} ·{' '}
                {selectedPerson.movementCount} movimiento
                {selectedPerson.movementCount === 1 ? '' : 's'}
              </Text>
              <Text style={styles.rowMeta}>
                Periodo anterior: {formatCop(selectedPerson.previousPeriodNetMinor)}
              </Text>
            </SurfaceCard>
            <SurfaceCard padding="md">
              <Text style={styles.rowTitle}>Categorias principales</Text>
              <Text style={styles.rowDescription}>
                {selectedPerson.topCategories.length > 0
                  ? selectedPerson.topCategories.map((category) => transactionCategoryLabel(category)).join(', ')
                  : 'Sin categorias dominantes visibles.'}
              </Text>
            </SurfaceCard>
            <PrimaryAction
              href={`/person/${selectedPerson.userId}` as Href}
              label="Abrir detalle operativo"
              variant="secondary"
            />
          </>
        ) : null}
      </DetailSheet>

      <DetailSheet
        onClose={() => setSelectedCategory(null)}
        title={selectedCategory?.label ?? 'Categoria'}
        visible={Boolean(selectedCategory)}
      >
        {selectedCategory ? (
          <>
            <SurfaceCard padding="md" variant="elevated">
              <Text style={styles.heroEyebrow}>Impacto del periodo</Text>
              <Text style={styles.heroAmount}>{formatCop(selectedCategory.netMinor)}</Text>
              <Text style={styles.heroCaption}>
                Te deben {formatCop(selectedCategory.owedToMeMinor)} · Debes {formatCop(selectedCategory.iOweMinor)}
              </Text>
            </SurfaceCard>
            <SurfaceCard padding="md">
              <Text style={styles.rowTitle}>Detalle</Text>
              <Text style={styles.rowDescription}>
                {selectedCategory.movementCount} movimiento
                {selectedCategory.movementCount === 1 ? '' : 's'} · Periodo anterior{' '}
                {formatCop(selectedCategory.previousNetMinor)}
              </Text>
              <Text style={styles.rowMeta}>
                Personas visibles: {selectedCategory.personLabels.length > 0 ? selectedCategory.personLabels.join(', ') : 'Sin detalle visible'}
              </Text>
            </SurfaceCard>
          </>
        ) : null}
      </DetailSheet>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.body,
    lineHeight: 22,
  },
  heroEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroAmount: {
    color: theme.colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 42,
  },
  heroCaption: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  heroInsight: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 20,
  },
  waterfallRow: {
    gap: theme.spacing.xs,
  },
  waterfallBar: {
    borderRadius: theme.radius.pill,
    height: 8,
    minWidth: 24,
  },
  barPositive: {
    backgroundColor: theme.colors.success,
  },
  barNegative: {
    backgroundColor: theme.colors.warning,
  },
  barNeutral: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  waterfallCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  rowDescription: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  rowMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  rowAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'right',
  },
  positiveText: {
    color: theme.colors.success,
  },
  negativeText: {
    color: theme.colors.warning,
  },
  insightText: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  quickTeasers: {
    gap: theme.spacing.sm,
  },
  teaserCard: {
    gap: theme.spacing.xs,
  },
  teaserTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  rankingRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  rankingCopy: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.88,
  },
  modalRoot: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xlarge,
    borderTopRightRadius: theme.radius.xlarge,
    gap: theme.spacing.md,
    maxHeight: '82%',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 5,
    width: 56,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
});
