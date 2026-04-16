import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextInput } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { AppTextInput } from '@/components/app-text-input';
import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { showBlockedActionAlert, useDelayedBusy, useFeedbackSnackbar } from '@/lib/action-feedback';
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

interface RegisterFormErrors {
  readonly personId?: string;
  readonly amount?: string;
  readonly description?: string;
}

interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

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
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    personId?: string;
    direction?: string;
  }>();
  const session = useSession();
  const { userId } = session;
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
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const searchInputRef = useRef<TextInput | null>(null);
  const amountInputRef = useRef<TextInput | null>(null);
  const descriptionInputRef = useRef<TextInput | null>(null);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const showBusyOverlay = useDelayedBusy(createRequest.isPending);

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
  const isDirty =
    query.trim().length > 0 ||
    amount.trim().length > 0 ||
    description.trim().length > 0 ||
    personId !== contextualPersonId ||
    direction !== (contextualDirection ?? 'owes_me');

  useEffect(() => {
    if (!isDirty || createRequest.isPending) {
      return;
    }

    return navigation.addListener('beforeRemove', (event: { preventDefault(): void; data: { action: object } }) => {
      event.preventDefault();
      Alert.alert('Tienes cambios sin guardar', 'Si sales ahora, perderas el movimiento que estas armando.', [
        {
          text: 'Seguir editando',
          style: 'cancel',
        },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () =>
            navigation.dispatch(event.data.action as Parameters<typeof navigation.dispatch>[0]),
        },
      ]);
    });
  }, [createRequest.isPending, isDirty, navigation]);

  function clearFieldError(field: keyof RegisterFormErrors) {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  }

  function validateForm(): RegisterFormErrors {
    return {
      personId: personId ? undefined : 'Selecciona a quien corresponde este movimiento.',
      amount: amountMinor > 0 ? undefined : 'Ingresa un monto mayor a 0.',
      description:
        description.trim().length > 0 ? undefined : 'Escribe o selecciona un concepto para continuar.',
    };
  }

  function showValidationFeedback(nextErrors: RegisterFormErrors) {
    const errorCount = Object.values(nextErrors).filter(Boolean).length;
    if (errorCount === 0) {
      return;
    }

    setErrors(nextErrors);
    setBanner({
      message:
        errorCount === 1
          ? 'Te falta 1 dato para guardar este movimiento.'
          : `Te faltan ${errorCount} datos para guardar este movimiento.`,
      tone: 'danger',
    });

    if (nextErrors.personId) {
      searchInputRef.current?.focus();
      return;
    }

    if (nextErrors.amount) {
      amountInputRef.current?.focus();
      return;
    }

    if (nextErrors.description) {
      descriptionInputRef.current?.focus();
    }
  }

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
    const nextErrors = validateForm();
    if (Object.values(nextErrors).some(Boolean)) {
      showValidationFeedback(nextErrors);
      return;
    }

    if (!userId) {
      setBanner({
        message: 'Tu sesion aun no esta lista. Intenta otra vez en unos segundos.',
        tone: 'danger',
      });
      return;
    }

    const debtorUserId = direction === 'i_owe' ? userId : personId;
    const creditorUserId = direction === 'i_owe' ? personId : userId;

    try {
      setBanner(null);
      await createRequest.mutateAsync({
        responderUserId: personId,
        debtorUserId,
        creditorUserId,
        amountMinor,
        description: description.trim(),
      });

      setAmount('');
      setDescription('');
      setQuery('');
      setErrors({});
      showSnackbar(`Movimiento creado con ${selectedPerson?.displayName ?? 'la otra persona'}.`, 'success');
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo guardar el movimiento.';
      if (
        showBlockedActionAlert(nextMessage, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            displayName: session.profile?.display_name ?? null,
            avatarPath: session.profile?.avatar_path ?? null,
            phoneE164: session.profile?.phone_e164 ?? null,
          },
        })
      ) {
        return;
      }

      setBanner({
        message: nextMessage,
        tone: 'danger',
      });
    }
  }

  return (
    <ScreenShell
      footer={
        canShowForm ? (
          <PrimaryAction
            disabled={createRequest.isPending}
            label={createRequest.isPending ? 'Guardando...' : 'Guardar'}
            loading={createRequest.isPending}
            onPress={createRequest.isPending ? undefined : () => void handleSave()}
          />
        ) : undefined
      }
      headerVariant="plain"
      overlay={<Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />}
      title="Nuevo movimiento"
      titleSize="title1"
    >
      {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

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
            <FieldBlock error={errors.personId ?? null} label="Persona">
              <>
                <AppTextInput
                  hasError={Boolean(errors.personId)}
                  onChangeText={(value) => {
                    setQuery(value);
                    clearFieldError('personId');
                  }}
                  placeholder="Buscar por nombre"
                  placeholderTextColor={theme.colors.muted}
                  ref={searchInputRef}
                  style={styles.input}
                  value={query}
                />
                <View style={styles.choiceRow}>
                  {people.slice(0, 8).map((person) => (
                    <ChoiceChip
                      key={person.userId}
                      label={person.displayName}
                      onPress={() => {
                        setPersonId(person.userId);
                        clearFieldError('personId');
                      }}
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
            <FieldBlock error={errors.amount ?? null} label="Monto">
              <AppTextInput
                hasError={Boolean(errors.amount)}
                keyboardType="number-pad"
                onChangeText={(value) => {
                  setAmount(value);
                  clearFieldError('amount');
                }}
                placeholder="45000"
                placeholderTextColor={theme.colors.muted}
                ref={amountInputRef}
                style={styles.input}
                value={amount}
              />
              <View style={styles.choiceRow}>
                {AMOUNT_SUGGESTIONS.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={formatCop(value * 100)}
                    onPress={() => {
                      setAmount(String(value));
                      clearFieldError('amount');
                    }}
                    selected={amount === String(value)}
                  />
                ))}
              </View>
              {amountMinor > 0 ? <Text style={styles.amountPreview}>{formatCop(amountMinor)}</Text> : null}
            </FieldBlock>
          </View>

          <View style={styles.sectionLast}>
            <FieldBlock error={errors.description ?? null} label="Concepto">
              <View style={styles.choiceRow}>
                {DESCRIPTION_SUGGESTIONS.map((item) => (
                  <ChoiceChip
                    key={item}
                    label={item}
                    onPress={() => {
                      setDescription(item);
                      clearFieldError('description');
                    }}
                    selected={description.trim().toLocaleLowerCase('es-CO') === item.toLocaleLowerCase('es-CO')}
                  />
                ))}
              </View>
              <AppTextInput
                hasError={Boolean(errors.description)}
                multiline
                onChangeText={(value) => {
                  setDescription(value);
                  clearFieldError('description');
                }}
                placeholder="Ej. cena, mercado, transporte"
                placeholderTextColor={theme.colors.muted}
                ref={descriptionInputRef}
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

      <LoadingOverlay
        message="No cierres esta pantalla mientras confirmamos el movimiento."
        title="Guardando movimiento"
        visible={showBusyOverlay}
      />
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
  input: {},
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
