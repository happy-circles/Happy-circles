import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';
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
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly tone?: ResponseActionTone;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
}

function ResponseActionButton({
  icon,
  label,
  tone = 'neutral',
  disabled = false,
  onPress,
}: ResponseActionButtonProps) {
  const iconColor = (() => {
    if (tone === 'primary') {
      return theme.colors.white;
    }

    if (tone === 'danger') {
      return theme.colors.danger;
    }

    return theme.colors.primary;
  })();

  return (
    <Pressable
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.responseAction,
        tone === 'primary' ? styles.responseActionPrimary : null,
        tone === 'danger' ? styles.responseActionDanger : null,
        pressed && !disabled ? styles.responseActionPressed : null,
        disabled ? styles.responseActionDisabled : null,
      ]}
    >
      <Ionicons color={iconColor} name={icon} size={15} />
      <Text
        numberOfLines={1}
        style={[
          styles.responseActionText,
          tone === 'primary' ? styles.responseActionPrimaryText : null,
          tone === 'danger' ? styles.responseActionDangerText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
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
  const createdByText = createdByLabel === 'Tu' ? 'Creado por ti' : `Creado por ${createdByLabel}`;

  return (
    <PendingSnippetCard
      amountLabel={formatCop(amountMinor)}
      amountTone={amountTone}
      detail={description}
      eyebrow={`Pendiente con ${counterpartyName}`}
      meta={`${createdByText} | ${createdAtLabel} · ${transactionCategoryLabel(safeCategory)}`}
      onPress={onPress}
      statusLabel={
        responseState === 'requires_you' ? 'Requiere tu respuesta' : 'Esperando respuesta'
      }
      statusTone={responseState === 'requires_you' ? 'warning' : 'neutral'}
      title={title}
      tone={responseState === 'requires_you' ? 'warning' : 'neutral'}
      variant="default"
    >
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
              onPress={onReject}
              tone="danger"
            />
            <ResponseActionButton
              disabled={busyAccept || busyReject || busyAmendment}
              icon={showAmendment ? 'chevron-up-circle-outline' : 'create-outline'}
              label={showAmendment ? 'Ocultar' : 'Cambiar monto'}
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
                  style={styles.input}
                  value={amendmentAmount}
                />
                {amendmentAmountMinor > 0 ? (
                  <Text style={styles.amountPreview}>{formatCop(amendmentAmountMinor)}</Text>
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
                  style={[styles.input, styles.textarea]}
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
                      busyAccept || busyReject || busyAmendment ? undefined : onSubmitAmendment
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

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionSlot: {
    flex: 1,
  },
  responseActionRail: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  responseAction: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 6,
  },
  responseActionPrimary: {
    backgroundColor: theme.colors.primary,
  },
  responseActionDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  responseActionPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  responseActionDisabled: {
    opacity: 0.58,
  },
  responseActionText: {
    color: theme.colors.primary,
    flexShrink: 1,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  responseActionPrimaryText: {
    color: theme.colors.white,
  },
  responseActionDangerText: {
    color: theme.colors.danger,
  },
  amendmentPanel: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  input: {},
  textarea: {
    minHeight: 96,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  amountPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
});
