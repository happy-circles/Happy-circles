import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl } from '@/components/segmented-control';
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
  { label: 'Pago manual', value: 'manual_settlement' },
] as const;

export function RegisterFlowScreen() {
  const router = useRouter();
  const { authMode, userId } = useSession();
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

  async function handleSave() {
    if (!personId || amountMinor <= 0 || description.trim().length === 0) {
      setMessage('Completa persona, monto y descripcion para guardar.');
      return;
    }

    if (authMode === 'demo') {
      setMessage(
        `${direction === 'i_owe' ? 'Debes' : 'Te deben'} ${formatCop(amountMinor)} con ${
          selectedPerson?.displayName ?? 'esta persona'
        }.`,
      );
      return;
    }

    if (!userId) {
      setMessage('Tu sesion aun no esta lista. Vuelve a intentarlo.');
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
        `${requestType === 'debt' ? 'Request de deuda' : 'Pago manual'} enviado a ${
          selectedPerson?.displayName ?? 'la contraparte'
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
      footer={
        <View style={styles.footer}>
          <PrimaryAction
            label={createRequest.isPending ? 'Guardando...' : 'Guardar'}
            onPress={createRequest.isPending ? undefined : () => void handleSave()}
          />
        </View>
      }
      largeTitle={false}
      subtitle="Registra un movimiento real en una sola vista."
      title="Registrar"
    >
      {message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
        </View>
      ) : null}

      {snapshotQuery.isLoading ? (
        <View style={styles.card}>
          <Text style={styles.label}>Cargando relaciones activas...</Text>
        </View>
      ) : null}

      {snapshotQuery.error ? (
        <View style={styles.card}>
          <Text style={styles.label}>No pudimos cargar tus relaciones.</Text>
          <Text style={styles.helper}>{snapshotQuery.error.message}</Text>
        </View>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length === 0 ? (
        <EmptyState
          title="No tienes relaciones activas"
          description="Para registrar una deuda o un pago manual primero necesitas una relacion activa en el backend."
        />
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Buscar persona</Text>
          <TextInput
            onChangeText={setQuery}
            placeholder="Nombre de la persona"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            value={query}
          />

          <View style={styles.peopleList}>
            {people.slice(0, 8).map((person) => {
              const selected = person.userId === personId;
              return (
                <Pressable
                  key={person.userId}
                  onPress={() => setPersonId(person.userId)}
                  style={[styles.personOption, selected ? styles.personOptionSelected : null]}
                >
                  <Text style={[styles.personOptionText, selected ? styles.personOptionTextSelected : null]}>
                    {person.displayName}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Tipo</Text>
          <SegmentedControl options={REQUEST_TYPE_OPTIONS} onChange={setRequestType} value={requestType} />

          <Text style={styles.label}>Direccion</Text>
          <SegmentedControl options={DIRECTION_OPTIONS} onChange={setDirection} value={direction} />

          <Text style={styles.label}>Monto</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={setAmount}
            placeholder="45000"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            value={amount}
          />
          {amountMinor > 0 ? <Text style={styles.preview}>{formatCop(amountMinor)}</Text> : null}

          <Text style={styles.label}>Descripcion</Text>
          <TextInput
            multiline
            onChangeText={setDescription}
            placeholder="Ej. cena, mercado, transporte"
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, styles.textarea]}
            value={description}
          />
        </View>
      ) : null}

      <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="secondary" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
  },
  banner: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.medium,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  bannerText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  textarea: {
    minHeight: 88,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  peopleList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  personOption: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  personOptionSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  personOptionText: {
    color: theme.colors.text,
  },
  personOptionTextSelected: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  preview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
  },
});
