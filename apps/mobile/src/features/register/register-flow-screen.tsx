import { useMemo, useState } from 'react';
import { Pressable, TextInput, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { formatCop } from '@/lib/data';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { useAppSnapshot, useCreateRequestMutation } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type Direction = 'i_owe' | 'owes_me';

const DIRECTION_OPTIONS = [
  { label: 'Entrada', value: 'owes_me' },
  { label: 'Salida', value: 'i_owe' },
] as const;

const AMOUNT_SUGGESTIONS = [20000, 50000, 100000] as const;
const DESCRIPTION_SUGGESTIONS = ['Comida', 'Mercado', 'Transporte', 'Salida'] as const;

function buildDraftPreview(input: {
  readonly amountMinor: number;
  readonly counterpartyName: string;
  readonly direction: Direction;
}): { readonly summary: string; readonly tone: Direction } {
  const amountLabel = formatCop(input.amountMinor);
  const flowLabel = input.direction === 'owes_me' ? 'entrada' : 'salida';

  return {
    summary: `Se enviara como ${flowLabel} a ${input.counterpartyName} por ${amountLabel}.`,
    tone: input.direction,
  };
}

export function RegisterFlowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    personId?: string;
    direction?: string;
  }>();
  const { userId } = useSession();
  const snapshotQuery = useAppSnapshot();
  const createRequest = useCreateRequestMutation();

  const contextualPersonId = typeof params.personId === 'string' ? params.personId : '';
  const contextualDirection: Direction | null =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;

  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState(contextualPersonId);
  const [direction, setDirection] = useState<Direction>(contextualDirection ?? 'owes_me');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const allPeople = snapshotQuery.data?.people ?? [];
  const people = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-CO');
    if (normalizedQuery.length === 0) {
      return allPeople;
    }

    return allPeople.filter((person) =>
      person.displayName.toLocaleLowerCase('es-CO').includes(normalizedQuery),
    );
  }, [allPeople, query]);

  const selectedPerson = allPeople.find((person) => person.userId === personId) ?? null;
  const amountMinor = Math.max(Number.parseInt(amount || '0', 10) * 100, 0);
  const normalizedQuery = query.trim();
  const draftPreview =
    selectedPerson && amountMinor > 0
      ? buildDraftPreview({
          amountMinor,
          counterpartyName: selectedPerson.displayName,
          direction,
        })
      : null;
  const canShowForm = !snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length > 0;

  function openInviteFlow(suggestedName?: string) {
    router.push({
      pathname: '/invite',
      params: {
        inviteeName: suggestedName?.trim() ? suggestedName.trim() : undefined,
        amountMinor: amountMinor > 0 ? String(amountMinor) : undefined,
        direction,
        description: description.trim().length > 0 ? description.trim() : undefined,
      },
    });
  }

  async function handleSave() {
    if (!personId || amountMinor <= 0 || description.trim().length === 0) {
      setMessage('Elige una persona, define un monto y selecciona o escribe un concepto.');
      return;
    }

    if (!userId) {
      setMessage('Tu sesion aun no esta lista. Intenta otra vez en unos segundos.');
      return;
    }

    const debtorUserId = direction === 'i_owe' ? userId : personId;
    const creditorUserId = direction === 'i_owe' ? personId : userId;

    try {
      await createRequest.mutateAsync({
        responderUserId: personId,
        debtorUserId,
        creditorUserId,
        amountMinor,
        description: description.trim(),
      });

      setMessage(`Propuesta enviada a ${selectedPerson?.displayName ?? 'la otra persona'}.`);
      setAmount('');
      setDescription('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el movimiento.');
    }
  }

  return (
    <ScreenShell
      footer={
        canShowForm ? (
          <PrimaryAction
            label={createRequest.isPending ? 'Guardando...' : 'Guardar'}
            onPress={createRequest.isPending ? undefined : () => void handleSave()}
          />
        ) : undefined
      }
      headerVariant="plain"
      title="Nuevo movimiento"
      titleSize="title1"
    >
      {message ? <MessageBanner message={message} /> : null}

      {snapshotQuery.isLoading ? <Text style={styles.helper}>Cargando relaciones activas...</Text> : null}

      {snapshotQuery.error ? (
        <View style={styles.inlineState}>
          <Text style={styles.stateTitle}>No pudimos cargar tus relaciones.</Text>
          <Text style={styles.helper}>{snapshotQuery.error.message}</Text>
        </View>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length === 0 ? (
        <View style={styles.stack}>
          <EmptyState
            description={noActiveRelationshipsEmptyState.description}
            title={noActiveRelationshipsEmptyState.title}
          />
          <PrimaryAction
            label={noActiveRelationshipsEmptyState.actionLabel}
            onPress={() => openInviteFlow()}
            subtitle={noActiveRelationshipsEmptyState.actionSubtitle}
          />
        </View>
      ) : null}

      {canShowForm ? (
        <View style={styles.form}>
          <View style={styles.section}>
            <FieldBlock label="Tipo">
              <View style={styles.typeBar}>
                {DIRECTION_OPTIONS.map((option) => {
                  const selected = option.value === direction;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setDirection(option.value)}
                      style={({ pressed }) => [
                        styles.typeButton,
                        selected ? styles.typeButtonActive : null,
                        pressed ? styles.typeButtonPressed : null,
                      ]}
                    >
                      <Text style={[styles.typeLabel, selected ? styles.typeLabelActive : null]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </FieldBlock>
          </View>

          <View style={styles.section}>
            <FieldBlock label="Persona">
              <>
                <TextInput
                  onChangeText={setQuery}
                  placeholder="Buscar por nombre"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  value={query}
                />
                <View style={styles.choiceRow}>
                  {people.slice(0, 8).map((person) => (
                    <ChoiceChip
                      key={person.userId}
                      label={person.displayName}
                      onPress={() => setPersonId(person.userId)}
                      selected={person.userId === personId}
                    />
                  ))}
                </View>
                {selectedPerson ? <Text style={styles.inlineNote}>Con {selectedPerson.displayName}</Text> : null}
                {normalizedQuery.length > 0 && people.length === 0 ? (
                  <View style={styles.inlineInvite}>
                    <Text style={styles.helper}>No esta en tu red.</Text>
                    <Pressable onPress={() => openInviteFlow(normalizedQuery)} style={styles.inlineInviteButton}>
                      <Text style={styles.inlineInviteButtonText}>Invitar</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            </FieldBlock>
          </View>

          <View style={styles.section}>
            <FieldBlock label="Monto">
              <TextInput
                keyboardType="number-pad"
                onChangeText={setAmount}
                placeholder="45000"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                value={amount}
              />
              <View style={styles.choiceRow}>
                {AMOUNT_SUGGESTIONS.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={formatCop(value * 100)}
                    onPress={() => setAmount(String(value))}
                    selected={amount === String(value)}
                  />
                ))}
              </View>
              {amountMinor > 0 ? <Text style={styles.amountPreview}>{formatCop(amountMinor)}</Text> : null}
            </FieldBlock>
          </View>

          <View style={styles.sectionLast}>
            <FieldBlock label="Concepto">
              <View style={styles.choiceRow}>
                {DESCRIPTION_SUGGESTIONS.map((item) => (
                  <ChoiceChip
                    key={item}
                    label={item}
                    onPress={() => setDescription(item)}
                    selected={description.trim().toLocaleLowerCase('es-CO') === item.toLocaleLowerCase('es-CO')}
                  />
                ))}
              </View>
              <TextInput
                multiline
                onChangeText={setDescription}
                placeholder="Ej. cena, mercado, transporte"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, styles.textarea]}
                value={description}
              />
              {draftPreview ? (
                <Text
                  style={[
                    styles.inlinePreview,
                    draftPreview.tone === 'owes_me' ? styles.inlinePreviewPositive : styles.inlinePreviewNegative,
                  ]}
                >
                  {draftPreview.summary}
                </Text>
              ) : null}
            </FieldBlock>
          </View>
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing.sm,
  },
  inlineState: {
    gap: theme.spacing.xs,
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  form: {
    gap: theme.spacing.sm,
  },
  section: {
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  sectionLast: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  typeBar: {
    alignItems: 'stretch',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  typeButton: {
    alignItems: 'center',
    flex: 1,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  typeButtonActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  typeButtonPressed: {
    opacity: 0.88,
  },
  typeLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  typeLabelActive: {
    color: theme.colors.text,
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
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  inlineNote: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  inlineInvite: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  inlineInviteButton: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  inlineInviteButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  amountPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlinePreview: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  inlinePreviewPositive: {
    color: theme.colors.success,
  },
  inlinePreviewNegative: {
    color: theme.colors.warning,
  },
});
