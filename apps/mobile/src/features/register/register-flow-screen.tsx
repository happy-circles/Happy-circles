import { useMemo, useState } from 'react';
import { TextInput, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useAppSnapshot, useCreateRequestMutation } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type Direction = 'i_owe' | 'owes_me';
type RequestKind = 'balance_increase' | 'balance_decrease';

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
  readonly requestKind: RequestKind;
}): { readonly detail: string; readonly title: string; readonly tone: Direction } {
  const amountLabel = formatCop(input.amountMinor);
  const flowLabel = input.direction === 'owes_me' ? 'entrada' : 'salida';
  const detail =
    input.requestKind === 'balance_decrease'
      ? `Reducira el saldo abierto con ${input.counterpartyName} cuando la otra persona lo acepte.`
      : `Quedara pendiente hasta que ${input.counterpartyName} la acepte.`;

  return {
    title: `Vas a registrar una ${flowLabel} de ${amountLabel}`,
    detail,
    tone: input.direction,
  };
}

export function RegisterFlowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    personId?: string;
    requestKind?: string;
    direction?: string;
  }>();
  const { userId } = useSession();
  const snapshotQuery = useAppSnapshot();
  const createRequest = useCreateRequestMutation();

  const contextualRequestKind: RequestKind =
    params.requestKind === 'balance_decrease' ? 'balance_decrease' : 'balance_increase';
  const contextualPersonId = typeof params.personId === 'string' ? params.personId : '';
  const contextualDirection: Direction | null =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;
  const isReductionMode = contextualRequestKind === 'balance_decrease';

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
          requestKind: contextualRequestKind,
        })
      : null;

  const screenTitle =
    isReductionMode && contextualDirection
      ? contextualDirection === 'owes_me'
        ? 'Registrar entrada'
        : 'Registrar salida'
      : 'Nuevo movimiento';
  const screenSubtitle = isReductionMode
    ? 'Este flujo reduce un saldo abierto. Solo confirmas monto y concepto.'
    : 'Registra solo lo esencial: persona, direccion, monto y concepto.';

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
        requestKind: contextualRequestKind,
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
      eyebrow={isReductionMode ? 'Saldo abierto' : 'Movimiento'}
      footer={
        <View style={styles.footer}>
          <View style={styles.footerAction}>
            <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="ghost" />
          </View>
          <View style={styles.footerAction}>
            <PrimaryAction
              label={createRequest.isPending ? 'Guardando...' : 'Guardar'}
              onPress={createRequest.isPending ? undefined : () => void handleSave()}
              subtitle={isReductionMode ? 'Reducir este saldo' : 'Crear propuesta'}
            />
          </View>
        </View>
      }
      largeTitle={false}
      subtitle={screenSubtitle}
      title={screenTitle}
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.cardTitle}>
          {isReductionMode ? 'Movimiento contextual' : 'Registro global'}
        </Text>
        <Text style={styles.helper}>
          {isReductionMode
            ? 'Vienes desde una relacion concreta, asi que este formulario solo reduce el saldo actual.'
            : 'Aqui solo creas nuevas entradas o salidas. Las reducciones de saldo salen desde cada relacion.'}
        </Text>
      </SurfaceCard>

      {message ? <MessageBanner message={message} /> : null}

      {snapshotQuery.isLoading ? (
        <SurfaceCard>
          <Text style={styles.helper}>Cargando relaciones activas...</Text>
        </SurfaceCard>
      ) : null}

      {snapshotQuery.error ? (
        <SurfaceCard>
          <Text style={styles.cardTitle}>No pudimos cargar tus relaciones.</Text>
          <Text style={styles.helper}>{snapshotQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length === 0 ? (
        <View style={styles.stack}>
          <EmptyState
            description="Primero invita a alguien por WhatsApp. Cuando esa persona este en tu red, podras registrar movimientos aqui."
            title="Todavia no tienes relaciones activas"
          />
          {!isReductionMode ? (
            <PrimaryAction
              label="Invitar persona"
              onPress={() => openInviteFlow()}
              subtitle="Llevamos el contexto del movimiento si ya lo tienes claro."
            />
          ) : null}
        </View>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length > 0 ? (
        <>
          <SurfaceCard padding="lg">
            {isReductionMode ? (
              selectedPerson ? (
                <SurfaceCard padding="sm" style={styles.selectedPerson} variant="muted">
                  <Text style={styles.selectedLabel}>Relacion seleccionada</Text>
                  <Text style={styles.selectedName}>{selectedPerson.displayName}</Text>
                </SurfaceCard>
              ) : (
                <Text style={styles.helper}>
                  No pudimos encontrar la relacion que intenta reducirse. Vuelve desde la tarjeta de la persona.
                </Text>
              )
            ) : (
              <FieldBlock hint="Busca y toca una opcion." label="Persona">
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
              </FieldBlock>
            )}

            {!isReductionMode && selectedPerson ? (
              <SurfaceCard padding="sm" style={styles.selectedPerson} variant="muted">
                <Text style={styles.selectedLabel}>Seleccionaste a</Text>
                <Text style={styles.selectedName}>{selectedPerson.displayName}</Text>
              </SurfaceCard>
            ) : null}

            {!isReductionMode && normalizedQuery.length > 0 && people.length === 0 ? (
              <SurfaceCard padding="md" variant="accent">
                <Text style={styles.cardTitle}>No encontramos a esa persona en tu red</Text>
                <Text style={styles.helper}>
                  Si es alguien nuevo, invita por WhatsApp y conserva el contexto del monto para el primer mensaje.
                </Text>
                <PrimaryAction
                  label="Invitar por WhatsApp"
                  onPress={() => openInviteFlow(normalizedQuery)}
                  variant="secondary"
                />
              </SurfaceCard>
            ) : null}
          </SurfaceCard>

          <SurfaceCard padding="lg">
            <FieldBlock
              hint={isReductionMode ? 'La relacion ya define si esta reduccion es entrada o salida.' : undefined}
              label="Direccion"
            >
              {isReductionMode ? (
                <SurfaceCard padding="sm" style={styles.selectedPerson} variant="muted">
                  <Text style={styles.selectedLabel}>Direccion fija</Text>
                  <Text style={styles.selectedName}>
                    {direction === 'owes_me' ? 'Entrada' : 'Salida'}
                  </Text>
                </SurfaceCard>
              ) : (
                <SegmentedControl
                  options={DIRECTION_OPTIONS}
                  onChange={setDirection}
                  value={direction}
                />
              )}
            </FieldBlock>

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

            <FieldBlock hint="Puedes tocar una sugerencia y ajustarla si hace falta." label="Concepto">
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
            </FieldBlock>

            {draftPreview ? (
              <SurfaceCard
                padding="md"
                style={[
                  styles.previewCard,
                  draftPreview.tone === 'owes_me' ? styles.previewCardPositive : styles.previewCardNegative,
                ]}
                variant="muted"
              >
                <Text style={styles.previewEyebrow}>Asi se va a leer</Text>
                <Text
                  style={[
                    styles.previewTitle,
                    draftPreview.tone === 'owes_me' ? styles.previewTitlePositive : styles.previewTitleNegative,
                  ]}
                >
                  {draftPreview.title}
                </Text>
                <Text style={styles.helper}>{draftPreview.detail}</Text>
              </SurfaceCard>
            ) : null}
          </SurfaceCard>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  footerAction: {
    flex: 1,
  },
  stack: {
    gap: theme.spacing.sm,
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
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  selectedPerson: {
    gap: 2,
  },
  selectedLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  selectedName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  amountPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  previewCard: {
    gap: theme.spacing.xs,
  },
  previewCardPositive: {
    borderLeftColor: theme.colors.success,
    borderLeftWidth: 3,
  },
  previewCardNegative: {
    borderLeftColor: theme.colors.warning,
    borderLeftWidth: 3,
  },
  previewEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  previewTitle: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 22,
  },
  previewTitlePositive: {
    color: theme.colors.success,
  },
  previewTitleNegative: {
    color: theme.colors.warning,
  },
});
