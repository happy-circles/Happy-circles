import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { formatCop } from '@/lib/data';
import {
  HistoryCaseCard,
  type HistoryCaseStepViewModel,
  type HistoryCaseTone,
} from '@/components/history-case-card';
import { triggerAppActionHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
import {
  pendingNotificationDotColor,
  pendingNotificationSurfaceColor,
} from '@/lib/pending-notification-visuals';
import { theme } from '@/lib/theme';
import { pendingFinancialRequestCardStyles as styles } from './pending-financial-request-card-styles';
import {
  DEFAULT_TRANSACTION_CATEGORY,
  type UserTransactionCategory,
  isUserTransactionCategory,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';

import { AppTextInput } from './app-text-input';
import { FieldBlock } from './field-block';
import { PrimaryAction } from './primary-action';
import { TransactionCategoryPicker } from './transaction-category-picker';
import { AppText } from '@/components/app-text';
import { moneyStatusCopy } from '@/lib/card-language';
import { useAppTheme } from '@/providers/theme-provider';

export interface PendingFinancialRequestHistoryStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly category?: string | null;
  readonly createdByLabel: string;
  readonly createdAtLabel: string;
  readonly status?: string;
  readonly isCurrent: boolean;
}

export interface PendingFinancialRequestCardProps {
  readonly actorAvatarUrl?: string | null;
  readonly counterpartyName: string;
  readonly responseState: 'requires_you' | 'waiting_other_side';
  readonly amountTone?: 'positive' | 'negative' | 'neutral' | 'danger';
  readonly title: string;
  readonly description: string;
  readonly category?: string | null;
  readonly amountMinor: number;
  readonly createdByLabel: string;
  readonly createdAtLabel: string;
  readonly focused?: boolean;
  readonly historySteps?: readonly PendingFinancialRequestHistoryStep[];
  readonly unread?: boolean;
  readonly busyAccept?: boolean;
  readonly busyReject?: boolean;
  readonly busyAmendment?: boolean;
  readonly actionsVisible?: boolean;
  readonly showAmendment?: boolean;
  readonly amendmentAmount?: string;
  readonly amendmentDescription?: string;
  readonly amendmentCategory?: UserTransactionCategory;
  readonly amendmentAmountError?: string | null;
  readonly amendmentDescriptionError?: string | null;
  readonly onAccept?: () => void;
  readonly onReject?: () => void;
  readonly onToggleAmendment?: () => void;
  readonly onChangeAmendmentAmount?: (value: string) => void;
  readonly onChangeAmendmentDescription?: (value: string) => void;
  readonly onChangeAmendmentCategory?: (value: UserTransactionCategory) => void;
  readonly onSubmitAmendment?: () => void;
  readonly onPress?: () => void;
  readonly isExpanded?: boolean;
  readonly onToggle?: () => void;
}

type ResponseActionTone = 'primary' | 'neutral' | 'danger';

interface ResponseActionButtonProps {
  readonly haptic?: 'impact' | 'selection' | 'none';
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly tone?: ResponseActionTone;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
}

function ResponseActionButton({
  haptic = 'impact',
  icon,
  label,
  tone = 'neutral',
  disabled = false,
  onPress,
}: ResponseActionButtonProps) {
  const activeTheme = useAppTheme();
  const iconColor = (() => {
    if (tone === 'primary') {
      return activeTheme.colors.white;
    }

    if (tone === 'danger') {
      return activeTheme.colors.danger;
    }

    return activeTheme.colors.primary;
  })();
  const labelColor = tone === 'primary' ? activeTheme.colors.white : iconColor;

  return (
    <Pressable
      disabled={disabled}
      onPress={
        disabled
          ? undefined
          : () => {
              if (haptic === 'selection') {
                triggerAppSelectionHaptic();
              } else if (haptic === 'impact') {
                triggerAppActionHaptic();
              }
              onPress?.();
            }
      }
      style={({ pressed }) => [
        styles.responseAction,
        {
          backgroundColor:
            tone === 'primary'
              ? activeTheme.colors.primary
              : tone === 'danger'
                ? `${activeTheme.colors.danger}12`
                : activeTheme.colors.surfaceSoft,
          borderColor:
            tone === 'primary'
              ? activeTheme.colors.primary
              : tone === 'danger'
                ? `${activeTheme.colors.danger}2E`
                : activeTheme.colors.border,
        },
        tone === 'primary' ? activeTheme.shadow.card : null,
        pressed && !disabled ? styles.responseActionPressed : null,
        disabled ? styles.responseActionDisabled : null,
      ]}
    >
      <Ionicons color={iconColor} name={icon} size={15} />
      <AppText numberOfLines={1} style={[styles.responseActionText, { color: labelColor }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

function hasPendingHistoryAmountChanges(
  steps: readonly PendingFinancialRequestHistoryStep[],
): boolean {
  return steps.some((step, index) => {
    const previousStep = steps[index - 1];
    return Boolean(previousStep && step.amountMinor !== previousStep.amountMinor);
  });
}

function pendingHistoryStepAmountLabel(
  steps: readonly PendingFinancialRequestHistoryStep[],
  step: PendingFinancialRequestHistoryStep,
  index: number,
): string | null {
  if (steps.length <= 1) {
    return formatCop(step.amountMinor);
  }

  if (!hasPendingHistoryAmountChanges(steps)) {
    return null;
  }

  const previousStep = steps[index - 1];
  if (previousStep && step.amountMinor === previousStep.amountMinor) {
    return null;
  }

  return formatCop(step.amountMinor);
}

function pendingHistoryStatusLabel(
  step: PendingFinancialRequestHistoryStep,
  responseState: PendingFinancialRequestCardProps['responseState'],
): string {
  if (step.isCurrent) {
    return responseState === 'requires_you'
      ? 'Actual - te toca responder'
      : 'Actual - responde la otra persona';
  }

  if (step.status === 'accepted') {
    return 'Aceptada';
  }

  if (step.status === 'rejected') {
    return 'Rechazada';
  }

  if (step.status === 'canceled') {
    return 'Cancelada';
  }

  if (step.status === 'expired') {
    return 'Expirada';
  }

  if (step.status === 'draft') {
    return 'En edicion';
  }

  return step.status === 'amended' ? 'Reemplazada' : 'Anterior';
}

function pendingHistoryStepTitle(
  steps: readonly PendingFinancialRequestHistoryStep[],
  step: PendingFinancialRequestHistoryStep,
  index: number,
): string {
  if (steps.length <= 1) {
    return step.title;
  }

  if (step.status === 'draft') {
    return step.title;
  }

  return `Instancia ${index + 1}: ${step.title}`;
}

function pendingTimelineTone(
  amountTone: PendingFinancialRequestCardProps['amountTone'],
): HistoryCaseTone {
  if (amountTone === 'positive') {
    return 'positive';
  }

  if (amountTone === 'negative') {
    return 'negative';
  }

  if (amountTone === 'danger') {
    return 'danger';
  }

  return 'neutral';
}

function pendingCardTone(
  amountTone: PendingFinancialRequestCardProps['amountTone'],
  responseState: PendingFinancialRequestCardProps['responseState'],
): HistoryCaseTone {
  if (amountTone === 'positive') {
    return 'positive';
  }

  if (amountTone === 'negative') {
    return 'negative';
  }

  if (amountTone === 'danger') {
    return 'danger';
  }

  return responseState === 'requires_you' ? 'negative' : 'neutral';
}

export function PendingFinancialRequestCard({
  actorAvatarUrl = null,
  counterpartyName,
  responseState,
  amountTone = 'neutral',
  title,
  description,
  category = DEFAULT_TRANSACTION_CATEGORY,
  amountMinor,
  createdAtLabel,
  createdByLabel,
  focused = false,
  historySteps = [],
  unread = false,
  busyAccept = false,
  busyReject = false,
  busyAmendment = false,
  actionsVisible = true,
  showAmendment = false,
  amendmentAmount = '',
  amendmentDescription = '',
  amendmentCategory = DEFAULT_TRANSACTION_CATEGORY,
  amendmentAmountError = null,
  amendmentDescriptionError = null,
  onAccept,
  onReject,
  onToggleAmendment,
  onChangeAmendmentAmount,
  onChangeAmendmentDescription,
  onChangeAmendmentCategory,
  onSubmitAmendment,
  onPress,
  isExpanded,
  onToggle,
}: PendingFinancialRequestCardProps) {
  const activeTheme = useAppTheme();
  const amendmentAmountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
  const safeCategory = isUserTransactionCategory(category)
    ? category
    : DEFAULT_TRANSACTION_CATEGORY;
  const requestHistorySteps =
    historySteps.length > 0
      ? historySteps
      : [
          {
            amountMinor,
            category: safeCategory,
            createdAtLabel,
            createdByLabel,
            description,
            id: 'current',
            isCurrent: true,
            status: 'pending',
            title: 'Propuesta actual',
          },
        ];
  const [isLocallyExpanded, setIsLocallyExpanded] = useState(false);
  const expanded = isExpanded ?? isLocallyExpanded;
  const statusLabel =
    responseState === 'requires_you'
      ? moneyStatusCopy.requiresYou
      : moneyStatusCopy.waitingOtherSide;
  const statusTone = responseState === 'requires_you' ? 'warning' : 'neutral';
  const timelineSteps: readonly HistoryCaseStepViewModel[] = requestHistorySteps.map(
    (step, index) => {
      const stepMeta = [pendingHistoryStatusLabel(step, responseState), step.createdAtLabel]
        .filter(Boolean)
        .join(' - ');

      return {
        actorLabel: step.createdByLabel,
        amountLabel: pendingHistoryStepAmountLabel(requestHistorySteps, step, index),
        category: step.category ?? safeCategory,
        conversationSide:
          step.createdByLabel === 'Tú' || step.createdByLabel === 'Tu' ? 'self' : 'other',
        detail: step.description,
        id: step.id,
        meta: stepMeta,
        title: pendingHistoryStepTitle(requestHistorySteps, step, index),
        tone: pendingTimelineTone(amountTone),
      };
    },
  );

  function handleToggle() {
    if (onToggle) {
      onToggle();
      return;
    }

    setIsLocallyExpanded((current) => !current);
  }

  return (
    <HistoryCaseCard
      attentionDot={unread}
      attentionDotColor={pendingNotificationDotColor(activeTheme)}
      actorAvatarUrl={actorAvatarUrl}
      amountLabel={formatCop(amountMinor)}
      description={null}
      eyebrow={counterpartyName}
      focused={focused}
      highlightSurface={unread}
      highlightSurfaceColor={pendingNotificationSurfaceColor(activeTheme)}
      meta={`${createdAtLabel} | ${transactionCategoryLabel(safeCategory)}`}
      onPress={onPress}
      onToggle={handleToggle}
      isExpanded={expanded}
      statusLabel={statusLabel}
      statusTone={statusTone}
      stepPresentation="conversation"
      steps={timelineSteps}
      title={title}
      tone={pendingCardTone(amountTone, responseState)}
    >
      {actionsVisible && responseState === 'requires_you' ? (
        <>
          <View style={styles.responseActionRail}>
            <ResponseActionButton
              disabled={busyAccept || busyReject || busyAmendment}
              icon={busyAccept ? 'ellipsis-horizontal-circle-outline' : 'checkmark-circle'}
              label={busyAccept ? 'Aceptando' : 'Aceptar'}
              onPress={onAccept}
              tone="primary"
            />
            <ResponseActionButton
              disabled={busyAccept || busyReject || busyAmendment}
              icon={busyReject ? 'ellipsis-horizontal-circle-outline' : 'close-circle-outline'}
              label={busyReject ? 'Enviando' : 'No aceptar'}
              haptic="none"
              onPress={onReject}
              tone="danger"
            />
            <ResponseActionButton
              disabled={busyAccept || busyReject || busyAmendment}
              icon={showAmendment ? 'chevron-up-circle-outline' : 'create-outline'}
              label={showAmendment ? 'Ocultar' : 'Editar'}
              haptic="selection"
              onPress={onToggleAmendment}
            />
          </View>

          {showAmendment ? (
            <View style={styles.amendmentPanel}>
              <FieldBlock error={amendmentAmountError} label="Monto">
                <AppTextInput
                  hasError={Boolean(amendmentAmountError)}
                  keyboardType="number-pad"
                  onChangeText={onChangeAmendmentAmount}
                  placeholder="45000"
                  placeholderTextColor={theme.colors.muted}
                  value={amendmentAmount}
                />
                {amendmentAmountMinor > 0 ? (
                  <AppText style={styles.amountPreview}>{formatCop(amendmentAmountMinor)}</AppText>
                ) : null}
              </FieldBlock>

              <FieldBlock error={amendmentDescriptionError} label="Concepto">
                <AppTextInput
                  hasError={Boolean(amendmentDescriptionError)}
                  multiline
                  onChangeText={onChangeAmendmentDescription}
                  placeholder="Nuevo concepto"
                  placeholderTextColor={theme.colors.muted}
                  value={amendmentDescription}
                />
              </FieldBlock>

              <FieldBlock label="Categoría">
                <TransactionCategoryPicker
                  onChange={onChangeAmendmentCategory ?? (() => undefined)}
                  value={amendmentCategory}
                />
              </FieldBlock>

              <View style={styles.actionRow}>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={busyAmendment ? 'Enviando...' : 'Enviar'}
                    compact
                    loading={busyAmendment}
                    onPress={
                      busyAccept || busyReject || busyAmendment
                        ? undefined
                        : () => {
                            triggerAppActionHaptic();
                            onSubmitAmendment?.();
                          }
                    }
                  />
                </View>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </HistoryCaseCard>
  );
}
