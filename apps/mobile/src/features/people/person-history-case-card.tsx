import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import {
  friendlyHistoryStepLabel,
  historyAmountIsVoided,
  historyCardTitle,
  historyCaseAmountLabel,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyCaseVisualCategory,
  historyImpactTone,
  type HistoryCase,
} from '@/lib/history-cases';
import { buildPersonHistoryConversationSteps } from './person-detail-runtime-utils';

export function PersonHistoryCaseCard({
  avatarUrl,
  counterpartyLabel,
  focused,
  isExpanded,
  itemCase,
  onToggle,
}: {
  readonly avatarUrl: string | null;
  readonly counterpartyLabel: string;
  readonly focused: boolean;
  readonly isExpanded: boolean;
  readonly itemCase: HistoryCase;
  readonly onToggle: () => void;
}) {
  const latest = itemCase.latest;
  const caseAmountLabel = historyCaseAmountLabel(latest);

  return (
    <HistoryCaseCard
      actorAvatarUrl={avatarUrl}
      amountLabel={caseAmountLabel}
      amountStruckThrough={historyAmountIsVoided(latest)}
      category={historyCaseVisualCategory(itemCase)}
      description={null}
      eyebrow={counterpartyLabel}
      focused={focused}
      isCycleSnippet={itemCase.isCycleSnippet}
      isExpanded={isExpanded}
      meta={historyCaseMeta(itemCase)}
      onToggle={onToggle}
      statusLabel={historyCaseStatusLabel(itemCase)}
      statusTone={historyCaseStatusTone(itemCase)}
      stepPresentation="conversation"
      steps={buildPersonHistoryConversationSteps({ caseAmountLabel, counterpartyLabel, itemCase })}
      title={historyCardTitle(itemCase) || friendlyHistoryStepLabel(latest)}
      tone={historyImpactTone(latest) as HistoryCaseTone}
    />
  );
}
