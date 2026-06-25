import type { PersonCardDto } from '@happy-circles/application';
import { useRouter } from 'expo-router';

import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import {
  friendlyHistoryStepLabel,
  historyAmountIsVoided,
  historyCardTitle,
  historyCaseAmountLabel,
  historyCaseEyebrow,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyCaseVisualCategory,
  historyImpactLabel,
  historyImpactTone,
  historyTimelineStepAmountLabel,
  historyTimelineStepCategory,
  historyTimelineStepDetailLabel,
  historyTimelineStepMetaLabel,
  type HistoryCase,
} from '@/lib/history-cases';
import { pushRoute } from '@/lib/navigation';
import type { TransactionHistoryCaseItem } from '@/lib/transaction-history-cases';
import { useAppTheme } from '@/providers/theme-provider';
import {
  initialsBackgroundColor,
  transactionHistoryCaseHref,
  transactionPersonForHistoryCase,
} from './transactions-screen-model';

export function TransactionHistoryCaseCard({
  itemCase,
  people,
}: {
  readonly itemCase: HistoryCase<TransactionHistoryCaseItem>;
  readonly people: readonly PersonCardDto[];
}) {
  const activeTheme = useAppTheme();
  const router = useRouter();
  const latest = itemCase.latest;
  const caseAmountLabel = historyCaseAmountLabel(latest);
  const caseTone = historyImpactTone(latest) as HistoryCaseTone;
  const caseTitle = friendlyHistoryStepLabel(latest);
  const caseDescription = historyCardTitle(itemCase);
  const caseEyebrow = historyCaseEyebrow(itemCase);
  const historyPerson = transactionPersonForHistoryCase(people, itemCase);
  const fallbackPerson = {
    displayName: caseEyebrow ?? latest.counterpartyLabel ?? 'Persona',
    userId: historyPerson?.userId ?? itemCase.id,
  };

  return (
    <HistoryCaseCard
      actorAvatarUrl={itemCase.isCycleSnippet ? null : (historyPerson?.avatarUrl ?? null)}
      actorFallbackColor={
        itemCase.isCycleSnippet ? undefined : initialsBackgroundColor(fallbackPerson, activeTheme)
      }
      amountLabel={caseAmountLabel}
      amountStruckThrough={historyAmountIsVoided(latest)}
      category={historyCaseVisualCategory(itemCase)}
      description={null}
      eyebrow={caseEyebrow}
      expandable={false}
      isCycleSnippet={itemCase.isCycleSnippet}
      isExpanded={false}
      meta={historyCaseMeta(itemCase)}
      onPress={() => pushRoute(router, transactionHistoryCaseHref(people, itemCase))}
      statusLabel={historyCaseStatusLabel(itemCase)}
      statusTone={historyCaseStatusTone(itemCase)}
      steps={itemCase.steps.map((step, index) => {
        const amountLabel = historyTimelineStepAmountLabel(itemCase, step, index);
        const impact = historyImpactLabel(step);

        return {
          amountLabel,
          category: historyTimelineStepCategory(itemCase, step, index),
          detail: historyTimelineStepDetailLabel(step),
          id: step.id,
          impact:
            !amountLabel && caseAmountLabel && impact?.includes(caseAmountLabel) ? null : impact,
          meta: historyTimelineStepMetaLabel(itemCase, step),
          title: friendlyHistoryStepLabel(step),
          tone: historyImpactTone(step) as HistoryCaseTone,
        };
      })}
      title={caseDescription || caseTitle}
      tone={caseTone}
    />
  );
}
