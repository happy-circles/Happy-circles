import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { DirectionPill } from '@/components/direction-pill';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { TransactionCategoryPicker } from '@/components/transaction-category-picker';
import { showBlockedActionAlert, useDelayedBusy } from '@/lib/action-feedback';
import { formatCop } from '@/lib/data';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { showGlobalFeedback } from '@/lib/global-feedback';
import { useAppSnapshot, useCreateRequestMutation } from '@/lib/live-data';
import { directionVisual } from '@/lib/direction-ui';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  DEFAULT_TRANSACTION_CATEGORY,
  type UserTransactionCategory,
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import { useSession } from '@/providers/session-provider';

type Direction = 'i_owe' | 'owes_me';

const DEFAULT_DIRECTION: Direction = 'i_owe';

const AMOUNT_SUGGESTIONS = [20000, 50000, 100000] as const;

interface RegisterPerson {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

interface RegisterFormErrors {
  readonly personId?: string;
  readonly amount?: string;
  readonly description?: string;
}

interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

function activityRecencyScore(value: string): number {
  const normalized = value.trim().toLocaleLowerCase('es-CO');

  if (normalized.length === 0 || normalized === 'sin movimientos todavia') {
    return 0;
  }

  if (normalized.includes('hoy')) {
    return 120;
  }

  if (normalized.includes('ayer')) {
    return 90;
  }

  const hoursMatch = normalized.match(/(\d+)\s+hora/);
  if (hoursMatch) {
    const hours = Number.parseInt(hoursMatch[1] ?? '0', 10);
    return Math.max(0, 100 - hours);
  }

  const minutesMatch = normalized.match(/(\d+)\s+min/);
  if (minutesMatch) {
    return 140;
  }

  if (normalized.includes('semana')) {
    return 20;
  }

  return 45;
}

function personRelevanceScore(
  person: RegisterPerson & {
    readonly pendingCount: number;
    readonly netAmountMinor: number;
    readonly lastActivityLabel: string;
  },
): number {
  const pendingWeight = person.pendingCount * 1000;
  const recencyWeight = activityRecencyScore(person.lastActivityLabel) * 10;
  const balanceWeight = Math.min(person.netAmountMinor / 1000, 200);

  return pendingWeight + recencyWeight + balanceWeight;
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

function sanitizeAmountInput(value: string): string {
  return value.replace(/\D/g, '');
}

function formatAmountInput(value: string): string {
  if (value.trim().length === 0) {
    return '';
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '';
  }

  return parsed.toLocaleString('es-CO');
}

function QuickPersonChip({
  person,
  onPress,
}: {
  readonly person: RegisterPerson;
  readonly onPress: (personId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(person.userId)}
      style={({ pressed }) => [
        styles.quickPersonChip,
        pressed ? styles.quickPersonChipPressed : null,
      ]}
    >
      <AppAvatar imageUrl={person.avatarUrl ?? null} label={person.displayName} size={30} />
      <Text numberOfLines={1} style={styles.quickPersonLabel}>
        {person.displayName}
      </Text>
    </Pressable>
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
  const [personSearchExpanded, setPersonSearchExpanded] = useState(false);
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
  const selectedPerson = allPeople.find((person) => person.userId === personId) ?? null;
  const normalizedQuery = query.trim();
  const normalizedQueryValue = normalizedQuery.toLocaleLowerCase('es-CO');
  const personSearchResults = useMemo(() => {
    if (normalizedQueryValue.length === 0) {
      return [];
    }

    return allPeople
      .filter((person) => person.userId !== personId)
      .filter((person) =>
        person.displayName.toLocaleLowerCase('es-CO').includes(normalizedQueryValue),
      )
      .sort((left, right) => {
        const leftStartsWith = left.displayName
          .toLocaleLowerCase('es-CO')
          .startsWith(normalizedQueryValue);
        const rightStartsWith = right.displayName
          .toLocaleLowerCase('es-CO')
          .startsWith(normalizedQueryValue);

        if (leftStartsWith !== rightStartsWith) {
          return leftStartsWith ? -1 : 1;
        }

        const scoreDifference = personRelevanceScore(right) - personRelevanceScore(left);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return left.displayName.localeCompare(right.displayName, 'es-CO');
      })
      .slice(0, 5);
  }, [allPeople, normalizedQueryValue, personId]);
  const quickPeople = useMemo(() => {
    const source = selectedPerson
      ? allPeople.filter((person) => person.userId !== selectedPerson.userId)
      : allPeople;

    return [...source]
      .sort((left, right) => {
        const scoreDifference = personRelevanceScore(right) - personRelevanceScore(left);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return left.displayName.localeCompare(right.displayName, 'es-CO');
      })
      .slice(0, 6);
  }, [allPeople, selectedPerson]);
  const amountMinor = Math.max(Number.parseInt(amount || '0', 10) * 100, 0);
  const amountDisplay = formatAmountInput(amount);
  const activeDirectionVisual = directionVisual(direction);
  const categoryIconName = transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap;
  const categoryIconColor = transactionCategoryColor(category);
  const categoryIconBackground = transactionCategoryBackgroundColor(category);
  const summaryText = selectedPerson
    ? `${
        direction === 'owes_me'
          ? `${selectedPerson.displayName} te debe`
          : `Le debes a ${selectedPerson.displayName}`
      } ${amountMinor > 0 ? formatCop(amountMinor) : 'sin monto'}`
    : null;
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

    Alert.alert(
      'Tienes cambios sin guardar',
      'Si sales ahora, perderas el movimiento que estas armando.',
      [
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
      ],
    );
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

  function openPersonSearch() {
    setPersonSearchExpanded(true);
    focusPersonSearch();
  }

  function closePersonSearch() {
    setPersonSearchExpanded(false);
    setQuery('');
  }

  function togglePersonSearch() {
    if (personSearchExpanded) {
      closePersonSearch();
      return;
    }

    openPersonSearch();
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
      openPersonSearch();
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
    closePersonSearch();
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
      setPersonSearchExpanded(false);
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
                  <View style={styles.formContent}>
                    <View
                      style={[styles.amountCard, errors.amount ? styles.amountCardError : null]}
                    >
                      <View style={styles.amountDisplayRow}>
                        <Text
                          style={[
                            styles.currencySymbol,
                            { color: activeDirectionVisual.accentColor },
                          ]}
                        >
                          $
                        </Text>
                        <NativeTextInput
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            setAmount(sanitizeAmountInput(value));
                            clearFieldError('amount');
                          }}
                          placeholder="0"
                          placeholderTextColor={activeDirectionVisual.accentColor}
                          ref={amountInputRef}
                          selectionColor={activeDirectionVisual.accentColor}
                          style={[styles.amountInput, { color: activeDirectionVisual.accentColor }]}
                          value={amountDisplay}
                        />
                      </View>
                      <View style={styles.amountSuggestionRow}>
                        {AMOUNT_SUGGESTIONS.map((value) => (
                          <ChoiceChip
                            key={value}
                            label={`${value / 1000}k`}
                            labelStyle={styles.amountSuggestionLabel}
                            onPress={() => {
                              setAmount(String(value));
                              clearFieldError('amount');
                            }}
                            selected={amount === String(value)}
                            style={styles.amountSuggestionChip}
                          />
                        ))}
                        <ChoiceChip
                          label="Otro"
                          onPress={() => {
                            setAmount('');
                            clearFieldError('amount');
                            amountInputRef.current?.focus();
                          }}
                          selected={
                            amount.trim().length > 0 &&
                            !AMOUNT_SUGGESTIONS.some((value) => amount === String(value))
                          }
                          style={styles.amountSuggestionChip}
                        />
                      </View>
                      {errors.amount ? (
                        <Text style={styles.inlineError}>Ingresa un monto valido</Text>
                      ) : null}
                    </View>

                    <View style={styles.directionRow}>
                      <DirectionPill
                        direction="i_owe"
                        onPress={() => setDirection('i_owe')}
                        selected={direction === 'i_owe'}
                        style={styles.directionPill}
                      />
                      <DirectionPill
                        direction="owes_me"
                        onPress={() => setDirection('owes_me')}
                        selected={direction === 'owes_me'}
                        style={styles.directionPill}
                      />
                    </View>

                    <View style={styles.fieldStack}>
                      <View style={styles.labelRow}>
                        <Text style={styles.sectionLabel}>Persona</Text>
                        {errors.personId ? (
                          <Text style={styles.inlineError}>Selecciona una persona</Text>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => {
                          clearFieldError('personId');
                          togglePersonSearch();
                        }}
                        style={({ pressed }) => [
                          styles.personPrimaryCard,
                          errors.personId ? styles.personPrimaryCardError : null,
                          pressed ? styles.personPrimaryCardPressed : null,
                        ]}
                      >
                        {selectedPerson ? (
                          <>
                            <AppAvatar
                              imageUrl={selectedPerson.avatarUrl ?? null}
                              label={selectedPerson.displayName}
                              size={42}
                            />
                            <View style={styles.personPrimaryCopy}>
                              <Text numberOfLines={1} style={styles.personPrimaryName}>
                                {selectedPerson.displayName}
                              </Text>
                              <Text numberOfLines={1} style={styles.personPrimaryMeta}>
                                {contextualPersonId === selectedPerson.userId
                                  ? 'Seleccionada desde personas'
                                  : 'Toca para cambiar o invitar'}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <View style={styles.personPrimaryCopy}>
                            <Text style={styles.personPrimaryName}>Seleccionar persona</Text>
                            <Text style={styles.personPrimaryMeta}>Buscar o invitar</Text>
                          </View>
                        )}
                        <Ionicons
                          color={theme.colors.textMuted}
                          name={personSearchExpanded ? 'chevron-up' : 'chevron-forward'}
                          size={20}
                        />
                      </Pressable>
                      {personSearchExpanded ? (
                        <View style={styles.personSearchPanel}>
                          <AppTextInput
                            autoCapitalize="words"
                            clearButtonMode="while-editing"
                            onChangeText={setQuery}
                            placeholder="Buscar otra persona"
                            placeholderTextColor={theme.colors.muted}
                            ref={searchInputRef}
                            style={styles.searchInput}
                            value={query}
                          />
                          {normalizedQuery.length > 0 ? (
                            personSearchResults.length > 0 ? (
                              <View style={styles.personSearchResults}>
                                {personSearchResults.map((person) => (
                                  <Pressable
                                    key={person.userId}
                                    onPress={() => {
                                      setPersonId(person.userId);
                                      clearFieldError('personId');
                                      closePersonSearch();
                                    }}
                                    style={({ pressed }) => [
                                      styles.personOption,
                                      pressed ? styles.personOptionPressed : null,
                                    ]}
                                  >
                                    <AppAvatar
                                      imageUrl={person.avatarUrl ?? null}
                                      label={person.displayName}
                                      rounded={false}
                                      size={40}
                                    />
                                    <View style={styles.personOptionCopy}>
                                      <Text numberOfLines={1} style={styles.personOptionName}>
                                        {person.displayName}
                                      </Text>
                                      <Text numberOfLines={1} style={styles.personOptionMeta}>
                                        Relacion activa
                                      </Text>
                                    </View>
                                  </Pressable>
                                ))}
                              </View>
                            ) : (
                              <View style={styles.personSearchEmptyState}>
                                <Text style={styles.supportTitle}>
                                  No encontramos a esa persona.
                                </Text>
                                <Text style={styles.supportText}>
                                  Puedes invitarla sin salir de este flujo.
                                </Text>
                                <PrimaryAction
                                  label="Invitar persona"
                                  onPress={() => openInviteFlow(normalizedQuery)}
                                  variant="secondary"
                                />
                              </View>
                            )
                          ) : (
                            <Text style={styles.personSearchHint}>
                              Escribe un nombre y te mostraremos coincidencias aqui mismo.
                            </Text>
                          )}
                        </View>
                      ) : null}
                      {quickPeople.length > 0 ? (
                        <ScrollView
                          horizontal
                          contentContainerStyle={styles.quickPeopleCarouselContent}
                          showsHorizontalScrollIndicator={false}
                        >
                          {quickPeople.map((person) => (
                            <QuickPersonChip
                              key={person.userId}
                              onPress={(nextPersonId) => {
                                setPersonId(nextPersonId);
                                clearFieldError('personId');
                                closePersonSearch();
                              }}
                              person={person}
                            />
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>

                    <View style={styles.fieldStack}>
                      <Text style={styles.sectionLabel}>Categoria</Text>
                      <TransactionCategoryPicker
                        onChange={setCategory}
                        value={category}
                        variant="carousel"
                      />
                    </View>

                    <View style={styles.fieldStack}>
                      <View style={styles.labelRow}>
                        <Text style={styles.sectionLabel}>Nota</Text>
                        {errors.description ? (
                          <Text style={styles.inlineError}>Es obligatoria</Text>
                        ) : null}
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
                        style={styles.noteInput}
                        value={description}
                      />
                    </View>
                  </View>
                </>
              ) : null}
            </BrandedRefreshScrollView>
          </View>
        </View>

        {canShowForm ? (
          <View style={styles.footer}>
            <View style={styles.footerSummary}>
              <Text numberOfLines={1} style={styles.footerSummaryText}>
                {summaryText
                  ? summaryText
                  : draftPreview
                    ? draftPreview.summary
                    : 'Completa el monto y la persona'}
              </Text>
              {summaryText ? (
                <View style={styles.footerCategoryBadge}>
                  <View
                    style={[styles.footerCategoryIcon, { backgroundColor: categoryIconBackground }]}
                  >
                    <Ionicons color={categoryIconColor} name={categoryIconName} size={14} />
                  </View>
                  <Text numberOfLines={1} style={styles.footerCategoryText}>
                    {transactionCategoryLabel(category)}
                  </Text>
                </View>
              ) : null}
            </View>
            <PrimaryAction
              disabled={createRequest.isPending}
              label={createRequest.isPending ? 'Guardando...' : 'Registrar'}
              loading={createRequest.isPending}
              onPress={createRequest.isPending ? undefined : () => void handleSave()}
            />
          </View>
        ) : null}
      </View>

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
    gap: theme.spacing.xs,
    maxHeight: '90%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    width: '100%',
    ...theme.shadow.floating,
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
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  closeButtonPressed: {
    opacity: 0.92,
  },
  panelArea: {
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  sheetScrollWrap: {
    flexShrink: 1,
    position: 'relative',
  },
  sheetScrollContent: {
    gap: theme.spacing.sm,
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
  formContent: {
    gap: theme.spacing.md,
  },
  amountCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  amountCardError: {
    borderColor: theme.colors.danger,
  },
  amountDisplayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  currencySymbol: {
    color: theme.colors.text,
    fontSize: 56,
    fontWeight: '300',
    lineHeight: 64,
    marginRight: theme.spacing.sm,
  },
  amountInput: {
    color: theme.colors.text,
    fontSize: 58,
    fontWeight: '800',
    lineHeight: 66,
    minHeight: 76,
    paddingVertical: 0,
    textAlign: 'center',
    width: '72%',
  },
  amountSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
    justifyContent: 'flex-start',
  },
  amountSuggestionChip: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  amountSuggestionLabel: {
    fontSize: theme.typography.callout,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  fieldStack: {
    gap: theme.spacing.xs,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  inlineError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  directionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  directionPill: {
    flex: 1,
  },
  personPrimaryCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 66,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  personPrimaryCardError: {
    borderColor: theme.colors.danger,
  },
  personPrimaryCardPressed: {
    opacity: 0.92,
  },
  personPrimaryCopy: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  personPrimaryName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  personPrimaryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 14,
  },
  quickPeopleCarouselContent: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  personSearchPanel: {
    gap: theme.spacing.xxs,
  },
  personSearchHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    paddingHorizontal: theme.spacing.xs,
  },
  personSearchResults: {
    gap: theme.spacing.xs,
  },
  quickPersonChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 48,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
  },
  quickPersonChipPressed: {
    opacity: 0.92,
  },
  quickPersonLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    maxWidth: 98,
  },
  noteInput: {
    fontSize: theme.typography.callout,
    height: 48,
    lineHeight: 18,
    minHeight: 48,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
  },
  footer: {
    gap: theme.spacing.xs,
    paddingTop: 6,
  },
  footerSummary: {
    alignItems: 'center',
    backgroundColor: '#f5f2fb',
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 46,
    paddingHorizontal: theme.spacing.sm,
  },
  footerSummaryText: {
    color: theme.colors.primary,
    flex: 1,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  footerCategoryBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  footerCategoryIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  footerCategoryText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  searchInput: {
    minHeight: 44,
  },
  personOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 60,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
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
    lineHeight: 16,
  },
  personSearchEmptyState: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
});
