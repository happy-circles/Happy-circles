import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { CardTimeline, type CardTone } from '@/components/card-shell';
import { triggerAppActionHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
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
import { PendingSnippetCard } from './pending-snippet-card';
import { PrimaryAction } from './primary-action';
import { TransactionCategoryPicker } from './transaction-category-picker';
import { AppText } from '@/components/app-text';

export interface PendingFinancialRequestHistoryStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly category?: string | null;
  readonly createdByLabel: string;
  readonly createdAtLabel: string;
  readonly isCurrent: boolean;
}

export interface PendingFinancialRequestCardProps {
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
  readonly busyAccept?: boolean;
  readonly busyReject?: boolean;
  readonly busyAmendment?: boolean;
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
  const iconColor = (() => {
    if (tone === 'danger') {
      return theme.colors.danger;
    }

    return theme.colors.primary;
  })();

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
        tone === 'primary' ? styles.responseActionPrimary : null,
        tone === 'danger' ? styles.responseActionDanger : null,
        pressed && !disabled ? styles.responseActionPressed : null,
        disabled ? styles.responseActionDisabled : null,
      ]}
    >
      <Ionicons color={iconColor} name={icon} size={15} />
      <AppText
        numberOfLines={1}
        style={[
          styles.responseActionText,
          tone === 'primary' ? styles.responseActionPrimaryText : null,
          tone === 'danger' ? styles.responseActionDangerText : null,
        ]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function historyActorLabel(label: string): string {
  return label === 'Tu' ? 'Por ti' : `Por ${label}`;
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
  if (!hasPendingHistoryAmountChanges(steps)) {
    return null;
  }

  const previousStep = steps[index - 1];
  if (previousStep && step.amountMinor === previousStep.amountMinor) {
    return null;
  }

  return formatCop(step.amountMinor);
}

function pendingTimelineTone(
  step: PendingFinancialRequestHistoryStep,
  amountTone: PendingFinancialRequestCardProps['amountTone'],
): CardTone {
  if (amountTone === 'positive') {
    return 'success';
  }

  if (amountTone === 'negative') {
    return 'warning';
  }

  if (amountTone === 'danger') {
    return 'danger';
  }

  return step.isCurrent ? 'primary' : 'neutral';
}

export function PendingFinancialRequestCard({
  counterpartyName,
  responseState,
  amountTone = 'neutral',
  title,
  description,
  category = DEFAULT_TRANSACTION_CATEGORY,
  amountMinor,
  createdByLabel,
  createdAtLabel,
  focused = false,
  historySteps = [],
  busyAccept = false,
  busyReject = false,
  busyAmendment = false,
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
}: PendingFinancialRequestCardProps) {
  const amendmentAmountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
  const safeCategory = isUserTransactionCategory(category)
    ? category
    : DEFAULT_TRANSACTION_CATEGORY;
  const visibleHistorySteps = historySteps.length > 1 ? historySteps : [];
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const currentHistoryStep = visibleHistorySteps[visibleHistorySteps.length - 1] ?? null;
  const currentHistoryAmountMinor = currentHistoryStep?.amountMinor ?? amountMinor;
  const showHistoryActors =
    new Set(visibleHistorySteps.map((step) => step.createdByLabel)).size > 1;
  const historyChangeCount = Math.max(visibleHistorySteps.length - 1, 0);
  const historyChangeLabel = `${historyChangeCount} cambio${historyChangeCount === 1 ? '' : 's'}`;

  return (
    <PendingSnippetCard
      amountLabel={formatCop(amountMinor)}
      amountTone={amountTone}
      detail={description}
      eyebrow={`Pendiente con ${counterpartyName}`}
      focused={focused}
      meta={`${createdAtLabel} | ${transactionCategoryLabel(safeCategory)}`}
      onPress={onPress}
      padding="sm"
      statusLabel={
        responseState === 'requires_you' ? 'Requiere tu respuesta' : 'Esperando respuesta'
      }
      statusTone={responseState === 'requires_you' ? 'warning' : 'neutral'}
      title={title}
      tone={responseState === 'requires_you' ? 'warning' : 'neutral'}
      variant="default"
    >
      {visibleHistorySteps.length > 0 ? (
        <View style={styles.historyPanel}>
          <Pressable
            accessibilityLabel={
              isHistoryExpanded ? 'Ocultar historia del pendiente' : 'Ver historia del pendiente'
            }
            accessibilityRole="button"
            onPress={() => {
              triggerAppSelectionHaptic();
              setIsHistoryExpanded((current) => !current);
            }}
            style={({ pressed }) => [
              styles.historyToggle,
              pressed ? styles.historyTogglePressed : null,
            ]}
          >
            <View style={styles.historyToggleCopy}>
              <Ionicons color={theme.colors.primary} name="git-branch-outline" size={15} />
              <View style={styles.historyToggleText}>
                <AppText style={styles.historyTitle}>Historia del pendiente</AppText>
                <AppText numberOfLines={1} style={styles.historySummary}>
                  {historyChangeLabel} - actual {formatCop(currentHistoryAmountMinor)}
                </AppText>
              </View>
            </View>
            <View style={styles.historyToggleAction}>
              <AppText style={styles.historyToggleActionText}>
                {isHistoryExpanded ? 'Ocultar' : 'Ver historia'}
              </AppText>
              <Ionicons
                color={theme.colors.textMuted}
                name={isHistoryExpanded ? 'chevron-up' : 'chevron-forward'}
                size={15}
              />
            </View>
          </Pressable>

          {isHistoryExpanded ? (
            <CardTimeline
              steps={visibleHistorySteps.map((step, index) => {
                const stepMeta = [
                  showHistoryActors ? historyActorLabel(step.createdByLabel) : null,
                  step.createdAtLabel,
                ]
                  .filter(Boolean)
                  .join(' - ');

                return {
                  amountLabel: pendingHistoryStepAmountLabel(visibleHistorySteps, step, index),
                  detail: step.description,
                  id: step.id,
                  meta: stepMeta,
                  title: step.title,
                  tone: pendingTimelineTone(step, amountTone),
                };
              })}
            />
          ) : null}
        </View>
      ) : null}

      {responseState === 'requires_you' ? (
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
              label={showAmendment ? 'Ocultar' : 'Cambiar monto'}
              haptic="selection"
              onPress={onToggleAmendment}
            />
          </View>

          {showAmendment ? (
            <View style={styles.amendmentPanel}>
              <FieldBlock
                error={amendmentAmountError}
                hint="Escribe el valor en pesos."
                label="Monto"
              >
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

              <FieldBlock
                error={amendmentDescriptionError}
                hint="Ajusta el concepto antes de enviarlo."
                label="Concepto"
              >
                <AppTextInput
                  hasError={Boolean(amendmentDescriptionError)}
                  multiline
                  onChangeText={onChangeAmendmentDescription}
                  placeholder="Explica el nuevo monto"
                  placeholderTextColor={theme.colors.muted}
                  value={amendmentDescription}
                />
              </FieldBlock>

              <FieldBlock
                hint="Puedes cambiarla si el contexto nuevo lo necesita."
                label="Categoria"
              >
                <TransactionCategoryPicker
                  onChange={onChangeAmendmentCategory ?? (() => undefined)}
                  value={amendmentCategory}
                />
              </FieldBlock>

              <View style={styles.actionRow}>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={busyAmendment ? 'Enviando...' : 'Enviar nuevo monto'}
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
    </PendingSnippetCard>
  );
}
