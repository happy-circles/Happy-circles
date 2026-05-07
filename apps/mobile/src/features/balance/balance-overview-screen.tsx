import { useEffect, useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';

import {
  BalanceDetail,
  CategoriesDetail,
  HappyCirclesDetail,
  PeopleDetail,
} from '@/features/balance/balance-lens-carousel';
import { balanceOverviewStyles as styles } from '@/features/balance/balance-overview-screen.styles';

import type {
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
} from '@happy-circles/application';

import { ScreenShell } from '@/components/screen-shell';
import { SurfaceCard } from '@/components/surface-card';
import { useAppSnapshot } from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  categoryLensAmount,
  isBalanceFocus,
  personLensAmount,
  type BalanceFocus,
} from './balance-helpers';
import { AppText } from '@/components/app-text';

export type { BalanceFocus } from './balance-helpers';

export interface BalanceOverviewScreenProps {
  readonly initialFocus?: string | null;
}

export function BalanceOverviewScreen({ initialFocus }: BalanceOverviewScreenProps) {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const overview = snapshotQuery.data?.balanceOverview ?? null;
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useState<BalanceAnalyticsPeriod>(analytics?.defaultPeriod ?? 'month');
  const [lens, setLens] = useState<BalanceAnalyticsLens>('balance');
  const [activeFocus, setActiveFocus] = useState<BalanceFocus>(
    isBalanceFocus(initialFocus) ? initialFocus : 'balance',
  );

  useEffect(() => {
    if (analytics?.defaultPeriod) {
      setPeriod(analytics.defaultPeriod);
    }
  }, [analytics?.defaultPeriod]);

  useEffect(() => {
    if (isBalanceFocus(initialFocus)) {
      setActiveFocus(initialFocus);
    }
  }, [initialFocus]);

  if (snapshotQuery.error && (!overview || !analytics)) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="No pudimos cargar el resumen financiero."
        title="Balance"
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !overview || !analytics) {
    return (
      <ScreenShell
        headerVariant="plain"
        refresh={refresh}
        subtitle="Estamos preparando el resumen de tu balance."
        title="Balance"
      >
        <SurfaceCard padding="lg" variant="elevated">
          <AppText style={styles.loadingText}>Cargando tu balance...</AppText>
        </SurfaceCard>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const sortedPeople = [...currentPeriod.people].sort((left, right) => {
    const amountDiff =
      Math.abs(personLensAmount(right, lens)) - Math.abs(personLensAmount(left, lens));
    if (amountDiff !== 0) {
      return amountDiff;
    }

    if (right.movementCount !== left.movementCount) {
      return right.movementCount - left.movementCount;
    }

    return left.label.localeCompare(right.label, 'es-CO');
  });
  const sortedCategories = [...currentPeriod.categories].sort((left, right) => {
    const amountDiff =
      Math.abs(categoryLensAmount(right, lens)) - Math.abs(categoryLensAmount(left, lens));
    if (amountDiff !== 0) {
      return amountDiff;
    }

    if (right.movementCount !== left.movementCount) {
      return right.movementCount - left.movementCount;
    }

    return left.label.localeCompare(right.label, 'es-CO');
  });

  return (
    <ScreenShell headerVariant="plain" refresh={refresh} title="Balance">
      {activeFocus === 'balance' ? (
        <BalanceDetail
          currentPeriod={currentPeriod}
          lens={lens}
          onLensChange={setLens}
          onPeriodChange={setPeriod}
          period={period}
          sortedCategories={sortedCategories}
          sortedPeople={sortedPeople}
        />
      ) : null}

      {activeFocus === 'people' ? (
        <PeopleDetail
          currentPeriod={currentPeriod}
          lens={lens}
          onLensChange={setLens}
          onOpenPerson={(person) => pushRoute(router, `/person/${person.userId}` as Href)}
          onPeriodChange={setPeriod}
          period={period}
          sortedPeople={sortedPeople}
        />
      ) : null}

      {activeFocus === 'categories' ? (
        <CategoriesDetail
          currentPeriod={currentPeriod}
          lens={lens}
          onLensChange={setLens}
          onPeriodChange={setPeriod}
          period={period}
          sortedCategories={sortedCategories}
        />
      ) : null}

      {activeFocus === 'settlements' ? <HappyCirclesDetail currentPeriod={currentPeriod} /> : null}
    </ScreenShell>
  );
}

export { BalanceLensCarousel } from '@/features/balance/balance-lens-carousel';
