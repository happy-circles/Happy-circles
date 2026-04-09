import { useMemo, useState } from 'react';
import { TextInput, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

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
type RequestType = 'debt' | 'manual_settlement';

const DIRECTION_OPTIONS = [
  { label: 'Debes', value: 'i_owe' },
  { label: 'Te deben', value: 'owes_me' },
] as const;

const REQUEST_TYPE_OPTIONS = [
  { label: 'Deuda', value: 'debt' },
  { label: 'Pago', value: 'manual_settlement' },
] as const;

const AMOUNT_SUGGESTIONS = [20000, 50000, 100000] as const;
const DESCRIPTION_SUGGESTIONS = ['Comida', 'Mercado', 'Transporte', 'Salida'] as const;

export function RegisterFlowScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const snapshotQuery = useAppSnapshot();
  const createRequest = useCreateRequestMutation();

  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState('');
  const [direction, setDirection] = useState<Direction>('i_owe');
  const [requestType, setRequestType] = useState<RequestType>('debt');
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

  function openInviteFlow(suggestedName?: string) {
    router.push({
      pathname: '/invite',
      params: {
        inviteeName: suggestedName?.trim() ? suggestedName.trim() : undefined,
        amountMinor: amountMinor > 0 ? String(amountMinor) : undefined,
        direction,
        requestType,
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
        requestType,
        responderUserId: personId,
        debtorUserId,
        creditorUserId,
        amountMinor,
        description: description.trim(),
      });

      setMessage(
        `${requestType === 'debt' ? 'Movimiento de deuda' : 'Pago manual'} enviado a ${
          selectedPerson?.displayName ?? 'la otra persona'
        }.`,
      );
      setAmount('');
      setDescription('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el movimiento.');
    }
  }

  return (
    <ScreenShell
      eyebrow="Movimiento"
      footer={
        <View style={styles.footer}>
          <View style={styles.footerAction}>
            <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="ghost" />
          </View>
          <View style={styles.footerAction}>
            <PrimaryAction
              label={createRequest.isPending ? 'Guardando...' : 'Guardar'}
              onPress={createRequest.isPending ? undefined : () => void handleSave()}
              subtitle="Deja listo el contexto"
            />
          </View>
        </View>
      }
      largeTitle={false}
      subtitle="Registra solo lo esencial: persona, tipo, monto y concepto."
      title="Nuevo movimiento"
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.cardTitle}>Un solo paso, sin friccion</Text>
        <Text style={styles.helper}>
          Si la persona no existe todavia en tu red, te llevamos directo a invitarla sin perder monto ni concepto.
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
          <PrimaryAction
            label="Invitar persona"
            onPress={() => openInviteFlow()}
            subtitle="Llevamos el contexto del movimiento si ya lo tienes claro."
          />
        </View>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length > 0 ? (
        <>
          <SurfaceCard padding="lg">
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

            {selectedPerson ? (
              <SurfaceCard padding="sm" style={styles.selectedPerson} variant="muted">
                <Text style={styles.selectedLabel}>Seleccionaste a</Text>
                <Text style={styles.selectedName}>{selectedPerson.displayName}</Text>
              </SurfaceCard>
            ) : null}

            {normalizedQuery.length > 0 && people.length === 0 ? (
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
            <FieldBlock label="Que estas registrando">
              <SegmentedControl options={REQUEST_TYPE_OPTIONS} onChange={setRequestType} value={requestType} />
            </FieldBlock>

            <FieldBlock label="Direccion">
              <SegmentedControl options={DIRECTION_OPTIONS} onChange={setDirection} value={direction} />
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
});
