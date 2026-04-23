import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  type TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import {
  BrandedRefreshScrollView,
  type BrandedRefreshProps,
} from '@/components/branded-refresh-control';
import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { SegmentedControl } from '@/components/segmented-control';
import { TransactionCategoryPicker } from '@/components/transaction-category-picker';
import { showBlockedActionAlert, useDelayedBusy } from '@/lib/action-feedback';
import { formatCop } from '@/lib/data';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { showGlobalFeedback } from '@/lib/global-feedback';
import { useAppSnapshot, useCreateRequestMutation } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  DEFAULT_TRANSACTION_CATEGORY,
  type UserTransactionCategory,
} from '@/lib/transaction-categories';
import { useSession } from '@/providers/session-provider';

type Direction = 'i_owe' | 'owes_me';

const DEFAULT_DIRECTION: Direction = 'i_owe';

const DIRECTION_OPTIONS = [
  { label: 'Debes', value: 'i_owe' },
  { label: 'Te deben', value: 'owes_me' },
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

  if (input.direction === 'owes_me') {
    return {
      summary: `${input.counterpartyName} te debe ${amountLabel}.`,
      tone: input.direction,
    };
  }

  return {
    summary: `Debes ${amountLabel} a ${input.counterpartyName}.`,
    tone: input.direction,
  };
}

function FlatSection({
  children,
  title,
  trailing,
  bordered = true,
}: {
  readonly children: ReactNode;
  readonly title: string;
  readonly trailing?: React.ReactNode;
  readonly bordered?: boolean;
}) {
  return (
    <View style={[styles.section, bordered ? styles.sectionBordered : null]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
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
  const refresh = useSnapshotRefresh(snapshotQuery);
  const createRequest = useCreateRequestMutation();

  const contextualPersonId = typeof params.personId === 'string' ? params.personId : '';
  const contextualDirection: Direction | null =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;
  const initialDirection = contextualDirection ?? DEFAULT_DIRECTION;

  const [query, setQuery] = useState('');
  const [personPickerVisible, setPersonPickerVisible] = useState(false);
  const [personId, setPersonId] = useState(contextualPersonId);
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<UserTransactionCategory>(DEFAULT_TRANSACTION_CATEGORY);
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const searchInputRef = useRef<TextInput | null>(null);
  const amountInputRef = useRef<TextInput | null>(null);
  const descriptionInputRef = useRef<TextInput | null>(null);
  const completedSaveRef = useRef(false);
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
    amount.trim().length > 0 ||
    category !== DEFAULT_TRANSACTION_CATEGORY ||
    description.trim().length > 0 ||
    personId !== contextualPersonId ||
    direction !== initialDirection;

  usePreventRemove(isDirty && !createRequest.isPending, ({ data }) => {
    if (completedSaveRef.current) {
      navigation.dispatch(data.action as Parameters<typeof navigation.dispatch>[0]);
      return;
    }

    Alert.alert('Tienes cambios sin guardar', 'Si sales ahora, perderas el movimiento que estas armando.', [
      {
        text: 'Seguir editando',
        style: 'cancel',
      },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () =>
          navigation.dispatch(data.action as Parameters<typeof navigation.dispatch>[0]),
      },
    ]);
  });

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
        description.trim().length > 0
          ? undefined
          : 'Escribe o selecciona un concepto para continuar.',
    };
  }

  function focusPersonSearch() {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 160);
  }

  function openPersonPicker() {
    setPersonPickerVisible(true);
    focusPersonSearch();
  }

  function closePersonPicker() {
    setPersonPickerVisible(false);
    setQuery('');
  }

  function closeRegister() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/home');
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
      openPersonPicker();
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
    closePersonPicker();
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
        category,
        description: description.trim(),
      });

      setAmount('');
      setCategory(DEFAULT_TRANSACTION_CATEGORY);
      setDescription('');
      setQuery('');
      setErrors({});
      setPersonPickerVisible(false);
      completedSaveRef.current = true;
      closeRegister();

      setTimeout(() => {
        showGlobalFeedback({
          title: 'Movimiento creado',
          message: `Con ${selectedPerson?.displayName ?? 'la otra persona'}.`,
          tone: 'success',
        });
      }, 220);
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

  const refreshConfig: BrandedRefreshProps | undefined = canShowForm ? refresh : undefined;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <Pressable onPress={closeRegister} style={styles.backdropTapTarget} />

      <View style={styles.layout}>
        <View style={styles.fixedTop}>
          <View style={styles.sheetHandle} />
          <View style={styles.heroRow}>
            <Text style={styles.heroTitle}>Nuevo movimiento</Text>
            <Pressable
              onPress={closeRegister}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Ionicons color={theme.colors.text} name="close" size={20} />
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>
            {contextualPersonId || contextualDirection
              ? 'Abriste este registro con datos precargados. Puedes cambiarlos.'
              : 'Registro rapido y compacto.'}
          </Text>
        </View>

        <View style={styles.panelArea}>
          {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

          <View style={styles.sheetScrollWrap}>
            <BrandedRefreshScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              refresh={refreshConfig}
              refreshIndicatorStyle={styles.sheetRefreshIndicator}
              showsVerticalScrollIndicator={false}
            >
              {snapshotQuery.isLoading ? (
                <View style={styles.loadingState}>
                  <View style={styles.loadingMotion}>
                    <HappyCirclesMotion size={88} variant="loading" />
                  </View>
                  <Text style={styles.supportText}>Cargando relaciones activas...</Text>
                </View>
              ) : null}

              {snapshotQuery.error ? (
                <View style={styles.loadingState}>
                  <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
                </View>
              ) : null}

              {!snapshotQuery.isLoading && !snapshotQuery.error && allPeople.length === 0 ? (
                <View style={styles.emptyState}>
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
                <>
                  <FlatSection title="Monto">
                    <View
                      style={[
                        styles.amountInputRow,
                        errors.amount ? styles.amountInputRowError : null,
                      ]}
                    >
                      <Text style={styles.currencySymbol}>$</Text>
                      <NativeTextInput
                        keyboardType="number-pad"
                        onChangeText={(value) => {
                          setAmount(value);
                          clearFieldError('amount');
                        }}
                        placeholder="0"
                        placeholderTextColor={theme.colors.muted}
                        ref={amountInputRef}
                        selectionColor={theme.colors.primary}
                        style={styles.amountInput}
                        value={amount}
                      />
                    </View>
                    <View style={styles.inlineChipRow}>
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
                    <Text style={styles.amountCaption}>
                      {amountMinor > 0 ? formatCop(amountMinor) : 'Ingresa un monto entero'}
                    </Text>
                  </FlatSection>

                  <FlatSection
                    title="Contexto"
                    trailing={
                      contextualPersonId || contextualDirection ? (
                        <Text style={styles.contextHint}>Ya viene listo</Text>
                      ) : undefined
                    }
                  >
                    <View style={styles.contextStack}>
                      <View style={styles.contextBlock}>
                        <Text style={styles.compactLabel}>Tipo</Text>
                        <SegmentedControl
                          onChange={(value) => setDirection(value)}
                          options={DIRECTION_OPTIONS}
                          value={direction}
                        />
                      </View>

                      <View style={styles.contextBlock}>
                        <View style={styles.labelRow}>
                          <Text style={styles.compactLabel}>Persona</Text>
                          {errors.personId ? (
                            <Text style={styles.inlineError}>Selecciona una persona</Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => {
                            clearFieldError('personId');
                            openPersonPicker();
                          }}
                          style={({ pressed }) => [
                            styles.personTrigger,
                            selectedPerson ? styles.personTriggerFilled : null,
                            errors.personId ? styles.personTriggerError : null,
                            pressed ? styles.personTriggerPressed : null,
                          ]}
                        >
                          {selectedPerson ? (
                            <>
                              <AppAvatar
                                imageUrl={selectedPerson.avatarUrl ?? null}
                                label={selectedPerson.displayName}
                                rounded={false}
                                size={40}
                              />
                              <View style={styles.personCopy}>
                                <Text numberOfLines={1} style={styles.personName}>
                                  {selectedPerson.displayName}
                                </Text>
                                <Text numberOfLines={1} style={styles.personMeta}>
                                  {contextualPersonId === selectedPerson.userId
                                    ? 'Seleccionada desde personas'
                                    : 'Toca para cambiar'}
                                </Text>
                              </View>
                            </>
                          ) : (
                            <View style={styles.personEmptyCopy}>
                              <Text style={styles.personEmptyTitle}>Seleccionar persona</Text>
                              <Text style={styles.personEmptyMeta}>Buscar o invitar</Text>
                            </View>
                          )}
                          <Ionicons
                            color={theme.colors.textMuted}
                            name="chevron-forward"
                            size={18}
                          />
                        </Pressable>
                      </View>
                    </View>
                  </FlatSection>

                  <FlatSection
                    title="Descripcion"
                    trailing={
                      errors.description ? (
                        <Text style={styles.inlineError}>Es obligatoria</Text>
                      ) : undefined
                    }
                  >
                    <View style={styles.inlineChipRow}>
                      {DESCRIPTION_SUGGESTIONS.map((item) => (
                        <ChoiceChip
                          key={item}
                          label={item}
                          onPress={() => {
                            setDescription(item);
                            clearFieldError('description');
                          }}
                          selected={
                            description.trim().toLocaleLowerCase('es-CO') ===
                            item.toLocaleLowerCase('es-CO')
                          }
                        />
                      ))}
                    </View>
                    <AppTextInput
                      hasError={Boolean(errors.description)}
                      onChangeText={(value) => {
                        setDescription(value);
                        clearFieldError('description');
                      }}
                      placeholder="Ej. Pizza del viernes"
                      placeholderTextColor={theme.colors.muted}
                      ref={descriptionInputRef}
                      returnKeyType="done"
                      style={styles.descriptionInput}
                      value={description}
                    />
                  </FlatSection>

                  <FlatSection bordered={false} title="Categoria">
                    <TransactionCategoryPicker
                      onChange={setCategory}
                      value={category}
                      variant="carousel"
                    />
                    {draftPreview ? (
                      <View
                        style={[
                          styles.previewPill,
                          draftPreview.tone === 'owes_me'
                            ? styles.previewPillPositive
                            : styles.previewPillNegative,
                        ]}
                      >
                        <Text
                          style={[
                            styles.previewText,
                            draftPreview.tone === 'owes_me'
                              ? styles.previewTextPositive
                              : styles.previewTextNegative,
                          ]}
                        >
                          {draftPreview.summary}
                        </Text>
                      </View>
                    ) : null}
                  </FlatSection>
                </>
              ) : null}
            </BrandedRefreshScrollView>
          </View>
        </View>

        {canShowForm ? (
          <View style={styles.footer}>
            <PrimaryAction
              disabled={createRequest.isPending}
              label={createRequest.isPending ? 'Guardando...' : 'Registrar movimiento'}
              loading={createRequest.isPending}
              onPress={createRequest.isPending ? undefined : () => void handleSave()}
            />
          </View>
        ) : null}
      </View>

      <Modal
        animationType="slide"
        onRequestClose={closePersonPicker}
        transparent
        visible={personPickerVisible}
      >
        <View style={styles.modalRoot}>
          <Pressable onPress={closePersonPicker} style={styles.modalScrim} />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Seleccionar persona</Text>
              <Pressable
                onPress={closePersonPicker}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.closeButtonPressed : null,
                ]}
              >
                <Ionicons color={theme.colors.text} name="close" size={18} />
              </Pressable>
            </View>

            <AppTextInput
              autoCapitalize="words"
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="Buscar persona"
              placeholderTextColor={theme.colors.muted}
              ref={searchInputRef}
              style={styles.searchInput}
              value={query}
            />

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {people.map((person) => {
                const isSelected = person.userId === personId;
                return (
                  <Pressable
                    key={person.userId}
                    onPress={() => {
                      setPersonId(person.userId);
                      clearFieldError('personId');
                      closePersonPicker();
                    }}
                    style={({ pressed }) => [
                      styles.personOption,
                      isSelected ? styles.personOptionSelected : null,
                      pressed ? styles.personOptionPressed : null,
                    ]}
                  >
                    <AppAvatar
                      imageUrl={person.avatarUrl ?? null}
                      label={person.displayName}
                      rounded={false}
                      size={44}
                    />
                    <View style={styles.personOptionCopy}>
                      <Text numberOfLines={1} style={styles.personOptionName}>
                        {person.displayName}
                      </Text>
                      <Text numberOfLines={1} style={styles.personOptionMeta}>
                        {person.userId === contextualPersonId
                          ? 'Entrada contextual'
                          : 'Relacion activa'}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons
                        color={theme.colors.primary}
                        name="checkmark-circle"
                        size={20}
                      />
                    ) : null}
                  </Pressable>
                );
              })}

              {normalizedQuery.length > 0 && people.length === 0 ? (
                <View style={styles.emptyPickerState}>
                  <Text style={styles.supportTitle}>No encontramos a esa persona.</Text>
                  <Text style={styles.supportText}>
                    Puedes invitarla sin salir de este flujo.
                  </Text>
                  <PrimaryAction
                    label="Invitar persona"
                    onPress={() => openInviteFlow(normalizedQuery)}
                    variant="secondary"
                  />
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <LoadingOverlay title="Guardando movimiento" visible={showBusyOverlay} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTapTarget: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  layout: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxHeight: '90%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    width: '100%',
  },
  fixedTop: {
    gap: theme.spacing.xs,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 5,
    width: 48,
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  heroTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeButtonPressed: {
    opacity: 0.88,
  },
  panelArea: {
    flexShrink: 1,
    gap: theme.spacing.md,
  },
  sheetScrollWrap: {
    flexShrink: 1,
    position: 'relative',
  },
  sheetScrollContent: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
  },
  sheetRefreshIndicator: {
    top: theme.spacing.xs,
  },
  loadingState: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  loadingMotion: {
    alignItems: 'center',
  },
  supportTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  emptyState: {
    gap: theme.spacing.sm,
  },
  section: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  sectionBordered: {
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  contextHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  amountInputRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 82,
    paddingBottom: theme.spacing.sm,
  },
  amountInputRowError: {
    borderBottomColor: theme.colors.danger,
  },
  currencySymbol: {
    color: theme.colors.text,
    fontSize: 48,
    fontWeight: '300',
    lineHeight: 54,
  },
  amountInput: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 52,
    fontWeight: '300',
    lineHeight: 58,
    minHeight: 72,
    paddingVertical: 0,
  },
  inlineChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  amountCaption: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  contextStack: {
    gap: theme.spacing.md,
  },
  contextBlock: {
    gap: theme.spacing.xs,
  },
  compactLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  inlineError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  personTrigger: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 60,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  personTriggerFilled: {
    backgroundColor: theme.colors.surface,
  },
  personTriggerError: {
    borderColor: theme.colors.danger,
  },
  personTriggerPressed: {
    opacity: 0.92,
  },
  personCopy: {
    flex: 1,
    gap: 3,
  },
  personName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  personMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  personEmptyCopy: {
    flex: 1,
    gap: 3,
  },
  personEmptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  personEmptyMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  descriptionInput: {
    minHeight: 52,
  },
  previewPill: {
    borderRadius: theme.radius.medium,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  previewPillPositive: {
    backgroundColor: theme.colors.successSoft,
  },
  previewPillNegative: {
    backgroundColor: theme.colors.warningSoft,
  },
  previewText: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  previewTextPositive: {
    color: theme.colors.success,
  },
  previewTextNegative: {
    color: theme.colors.warning,
  },
  footer: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: theme.spacing.sm,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheetCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxHeight: '78%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    ...theme.shadow.floating,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  searchInput: {
    minHeight: 48,
  },
  sheetContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  personOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 68,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  personOptionSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  personOptionPressed: {
    opacity: 0.92,
  },
  personOptionCopy: {
    flex: 1,
    gap: 3,
  },
  personOptionName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  personOptionMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  emptyPickerState: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
});
