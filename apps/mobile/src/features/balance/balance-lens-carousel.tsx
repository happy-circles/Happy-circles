import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPeriod,
  BalanceAnalyticsPeriodDto,
} from '@happy-circles/application';

import { SwipePager } from '@/components/swipe-pager';
import { balanceOverviewStyles as styles } from './balance-overview-screen.styles';
import {
  FOCUS_OPTIONS,
  categoryLensAmount,
  type BalanceFocus,
  type FocusOption,
} from './balance-helpers';
import {
  BalanceFocusCard,
  CategoriesFocusCard,
  SettlementsFocusCard,
} from './balance-lens-focus-cards';

const FOCUS_VALUES: readonly BalanceFocus[] = ['categories', 'balance', 'circles'];
const CAROUSEL_FOCUS_OPTIONS: readonly FocusOption[] = FOCUS_VALUES.map((value) => {
  const option = FOCUS_OPTIONS.find((candidate) => candidate.value === value);
  if (!option) {
    throw new Error(`Missing balance focus option: ${value}`);
  }

  return option;
});

function CarouselDots({
  activeFocus,
  disabled = false,
  onChange,
}: {
  readonly activeFocus: BalanceFocus;
  readonly disabled?: boolean;
  readonly onChange: (focus: BalanceFocus) => void;
}) {
  return (
    <View style={styles.carouselDots}>
      {CAROUSEL_FOCUS_OPTIONS.map((option) => {
        const selected = option.value === activeFocus;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.carouselDotHitArea, pressed ? styles.pressed : null]}
          >
            <View style={[styles.carouselDot, selected ? styles.carouselDotSelected : null]} />
          </Pressable>
        );
      })}
    </View>
  );
}

type BalanceCarouselOverview = {
  readonly summary: {
    readonly netBalanceMinor: number;
    readonly totalIOweMinor: number;
    readonly totalOwedToMeMinor: number;
  };
};

type BalanceCarouselAnalytics = {
  readonly defaultPeriod: BalanceAnalyticsPeriod;
  readonly periods: Record<BalanceAnalyticsPeriod, BalanceAnalyticsPeriodDto>;
};

export function BalanceLensCarousel({
  analytics,
  currentUserId,
  happyFacesClosedCount,
  happyFacesTotal,
  initialFocus = 'balance',
  isActive = true,
  lens = 'balance',
  newCircleProposalIds,
  onCategoryPress,
  onFocusPress,
  onHappyFacesPress,
  onSwipeInteractionChange,
  overview,
  period,
  swipeEnabled = true,
}: {
  readonly analytics: BalanceCarouselAnalytics;
  readonly currentUserId?: string | null;
  readonly happyFacesClosedCount?: number;
  readonly happyFacesTotal?: number;
  readonly initialFocus?: BalanceFocus;
  readonly isActive?: boolean;
  readonly lens?: BalanceAnalyticsLens;
  readonly newCircleProposalIds?: ReadonlySet<string>;
  readonly onCategoryPress?: (
    category: BalanceAnalyticsCategoryRowDto['category'],
    period: BalanceAnalyticsPeriod,
  ) => void;
  readonly onFocusPress?: (focus: BalanceFocus) => void;
  readonly onHappyFacesPress?: () => void;
  readonly onSwipeInteractionChange?: (isInteracting: boolean) => void;
  readonly overview: BalanceCarouselOverview;
  readonly period?: BalanceAnalyticsPeriod;
  readonly swipeEnabled?: boolean;
}) {
  const resolvedInitialFocus = initialFocus === 'people' ? 'balance' : initialFocus;
  const [activeFocus, setActiveFocus] = useState<BalanceFocus>(resolvedInitialFocus);
  const [visualFocus, setVisualFocus] = useState<BalanceFocus>(resolvedInitialFocus);
  const [pagerInteracting, setPagerInteracting] = useState(false);
  const onSwipeInteractionChangeRef = useRef(onSwipeInteractionChange);
  const selectedPeriod = period ?? analytics.defaultPeriod ?? 'month';
  const currentPeriod = analytics.periods[selectedPeriod];
  const balanceSummary = currentPeriod.summaries.balance;
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

  useEffect(() => {
    setActiveFocus(resolvedInitialFocus);
    setVisualFocus(resolvedInitialFocus);
  }, [resolvedInitialFocus]);

  useEffect(() => {
    onSwipeInteractionChangeRef.current = onSwipeInteractionChange;
  }, [onSwipeInteractionChange]);

  useEffect(
    () => () => {
      onSwipeInteractionChangeRef.current?.(false);
    },
    [],
  );

  function handlePagerInteractionChange(isInteracting: boolean) {
    setPagerInteracting(isInteracting);
    onSwipeInteractionChangeRef.current?.(isInteracting);
  }

  function changeActiveFocus(nextFocus: BalanceFocus) {
    setVisualFocus(nextFocus);
    setActiveFocus(nextFocus);
  }

  function requestFocusFromDots(nextFocus: BalanceFocus) {
    if (pagerInteracting || nextFocus === activeFocus) {
      return;
    }

    setPagerInteracting(true);
    changeActiveFocus(nextFocus);
  }

  function renderPageContent(focus: BalanceFocus, content: ReactNode) {
    const pageContent = onFocusPress ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => onFocusPress(focus)}
        style={({ pressed }) => [pressed ? styles.pressed : null]}
      >
        {content}
      </Pressable>
    ) : (
      content
    );

    return pageContent;
  }

  function renderCarouselPage(focus: BalanceFocus) {
    if (focus === 'balance') {
      return renderPageContent(
        focus,
        <BalanceFocusCard
          happyFacesClosedCount={happyFacesClosedCount}
          happyFacesTotal={happyFacesTotal}
          netBalanceMinor={overview.summary.netBalanceMinor}
          onHappyFacesPress={onHappyFacesPress}
          periodChangeMinor={balanceSummary.deltaMinor}
          totalIOweMinor={overview.summary.totalIOweMinor}
          totalOwedToMeMinor={overview.summary.totalOwedToMeMinor}
        />,
      );
    }

    if (focus === 'categories') {
      const categoriesCard = (
        <CategoriesFocusCard
          categories={sortedCategories}
          isActive={isActive && visualFocus === 'categories'}
          onCategoryPress={
            onCategoryPress ? (category) => onCategoryPress(category, selectedPeriod) : undefined
          }
        />
      );

      return renderPageContent(focus, categoriesCard);
    }

    return renderPageContent(
      focus,
      <SettlementsFocusCard
        activeProposals={currentPeriod.settlements.activeProposals}
        changeRatio={currentPeriod.settlements.changeRatio}
        closedCircleCount={happyFacesClosedCount}
        currentUserId={currentUserId}
        newCircleProposalIds={newCircleProposalIds}
        resolvedMinor={currentPeriod.settlements.resolvedMinor}
      />,
    );
  }

  return (
    <View style={styles.carouselBlock}>
      <SwipePager
        accessibilityLabel="Resumen de balance"
        onChange={changeActiveFocus}
        onInteractionStateChange={handlePagerInteractionChange}
        onPreviewChange={setVisualFocus}
        renderPage={(focus) => renderCarouselPage(focus)}
        scrollEnabled={swipeEnabled}
        style={styles.carouselViewport}
        value={activeFocus}
        values={FOCUS_VALUES}
      />

      <CarouselDots
        activeFocus={visualFocus}
        disabled={pagerInteracting}
        onChange={(nextFocus) => {
          requestFocusFromDots(nextFocus);
        }}
      />
    </View>
  );
}
