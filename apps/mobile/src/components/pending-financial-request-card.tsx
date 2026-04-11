import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

import { FieldBlock } from './field-block';
import { PendingSnippetCard } from './pending-snippet-card';
import { PrimaryAction } from './primary-action';

export interface PendingFinancialRequestCardProps {
  readonly counterpartyName: string;
  readonly responseState: 'requires_you' | 'waiting_other_side';
  readonly amountTone?: 'positive' | 'negative' | 'neutral' | 'danger';
  readonly title: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly createdByLabel: string;
  readonly createdAtLabel: string;
  readonly busyAccept?: boolean;
  readonly busyReject?: boolean;
  readonly busyAmendment?: boolean;
  readonly showAmendment?: boolean;
  readonly amendmentAmount?: string;
  readonly amendmentDescription?: string;
  readonly onAccept?: () => void;
  readonly onReject?: () => void;
  readonly onToggleAmendment?: () => void;
  readonly onChangeAmendmentAmount?: (value: string) => void;
  readonly onChangeAmendmentDescription?: (value: string) => void;
  readonly onSubmitAmendment?: () => void;
  readonly onPress?: () => void;
}

export function PendingFinancialRequestCard({
  counterpartyName,
  responseState,
  amountTone = 'neutral',
  title,
  description,
  amountMinor,
  createdByLabel,
  createdAtLabel,
  busyAccept = false,
  busyReject = false,
  busyAmendment = false,
  showAmendment = false,
  amendmentAmount = '',
  amendmentDescription = '',
  onAccept,
  onReject,
  onToggleAmendment,
  onChangeAmendmentAmount,
  onChangeAmendmentDescription,
  onSubmitAmendment,
  onPress,
}: PendingFinancialRequestCardProps) {
  const amendmentAmountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);

  return (
    <PendingSnippetCard
      amountLabel={formatCop(amountMinor)}
      amountTone={amountTone}
      detail={description}
      eyebrow={`Pendiente con ${counterpartyName}`}
      meta={`Creado por ${createdByLabel} | ${createdAtLabel}`}
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
          <View style={styles.actionRow}>
            <View style={styles.actionSlot}>
              <PrimaryAction
                label={busyAccept ? 'Aceptando...' : 'Aceptar'}
                onPress={busyAccept || busyReject || busyAmendment ? undefined : onAccept}
                compact
              />
            </View>
          </View>
          <View style={styles.inlineActionRow}>
            <Pressable
              onPress={busyAccept || busyReject || busyAmendment ? undefined : onReject}
              style={({ pressed }) => [styles.inlineAction, pressed ? styles.inlineActionPressed : null]}
            >
              <Text style={[styles.inlineActionText, styles.inlineActionDangerText]}>
                {busyReject ? 'Enviando...' : 'No aceptar'}
              </Text>
            </Pressable>
            <Pressable
              onPress={busyAccept || busyReject || busyAmendment ? undefined : onToggleAmendment}
              style={({ pressed }) => [styles.inlineAction, pressed ? styles.inlineActionPressed : null]}
            >
              <Text style={styles.inlineActionText}>
                {showAmendment ? 'Ocultar cambio' : 'Cambiar monto'}
              </Text>
            </Pressable>
          </View>

          {showAmendment ? (
            <View style={styles.amendmentPanel}>
              <FieldBlock hint="Escribe el valor en pesos." label="Monto">
                <TextInput
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

              <FieldBlock hint="Ajusta el concepto antes de enviarlo." label="Concepto">
                <TextInput
                  multiline
                  onChangeText={onChangeAmendmentDescription}
                  placeholder="Explica el nuevo monto"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, styles.textarea]}
                  value={amendmentDescription}
                />
              </FieldBlock>

              <View style={styles.actionRow}>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={busyAmendment ? 'Enviando...' : 'Enviar nuevo monto'}
                    onPress={busyAccept || busyReject || busyAmendment ? undefined : onSubmitAmendment}
                    compact
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
  inlineActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  inlineAction: {
    paddingVertical: 2,
  },
  inlineActionPressed: {
    opacity: 0.62,
  },
  inlineActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineActionDangerText: {
    color: theme.colors.danger,
  },
  amendmentPanel: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
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
