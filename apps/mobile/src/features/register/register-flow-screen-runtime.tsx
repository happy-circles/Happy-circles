import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput, type AppTextInputRef } from '@/components/app-text-input';
import {
  BrandedRefreshScrollView,
  type BrandedRefreshProps,
} from '@/components/branded-refresh-control';
import { ChoiceChip } from '@/components/choice-chip';
import { DirectionPill } from '@/components/direction-pill';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { MessageBanner } from '@/components/message-banner';
import { PendingFinancialRequestCard } from '@/components/pending-financial-request-card';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenFinalAction } from '@/components/screen-final-action';
import { TransactionCategoryPicker } from '@/components/transaction-category-picker';
import { TransactionActionFeedbackOverlay } from '@/components/transaction-action-feedback-overlay';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import { showBlockedActionAlert, useActionFeedbackOverlay } from '@/lib/action-feedback';
import { formatCop } from '@/lib/data';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { showGlobalFeedback } from '@/lib/global-feedback';
import {
  useAmendFinancialRequestMutation,
  useAppSnapshot,
  useCreateRequestMutation,
} from '@/lib/live-data';
import { directionVisual } from '@/lib/direction-ui';
import { backOrReturnTo, returnToRoute } from '@/lib/navigation';
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
import { useAppTheme } from '@/providers/theme-provider';
import {
  AMOUNT_SUGGESTIONS,
  buildCorrectionDraft,
  buildCorrectionPendingContent,
  buildDraftPreview,
  formatAmountInput,
  personRelevanceScore,
  resolveRegisterRouteParams,
  sanitizeAmountInput,
  type Direction,
  type RegisterPerson,
} from './register-flow-helpers';
import { styles } from './register-flow-screen-styles';
import { AppText } from '@/components/app-text';

const KEYBOARD_SCROLL_GAP = 16;
const INPUT_FOCUS_SCROLL_DELAY_MS = 120;
const MIN_KEYBOARD_SCROLL_HEIGHT = 140;

type RegisterFocusTarget = 'amount' | 'person' | 'description';
type FieldMetrics = { readonly height: number; readonly y: number };

interface RegisterFormErrors {
  readonly personId?: string;
  readonly amount?: string;
  readonly description?: string;
}

interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

function buildRegisterSuccessHref(input: {
  readonly focusId?: string | null;
  readonly panel: 'pending' | 'history';
  readonly personId: string;
}): Href {
  const focusParam = input.focusId ? `&focus=${encodeURIComponent(input.focusId)}` : '';

  return `/person/${encodeURIComponent(input.personId)}?panel=${input.panel}${focusParam}` as Href;
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function QuickPersonChip({
  person,
  onPress,
}: {
  readonly person: RegisterPerson;
  readonly onPress: (personId: string) => void;
}) {
  const activeTheme = useAppTheme();

  return (
    <Pressable
      onPress={() => onPress(person.userId)}
      style={({ pressed }) => [
        styles.quickPersonChip,
        { backgroundColor: activeTheme.colors.surface, borderColor: activeTheme.colors.border },
        pressed ? styles.quickPersonChipPressed : null,
      ]}
    >
      <AppAvatar imageUrl={person.avatarUrl ?? null} label={person.displayName} size={30} />
      <AppText numberOfLines={1} style={styles.quickPersonLabel}>
        {person.displayName}
      </AppText>
    </Pressable>
  );
}

export function RegisterFlowScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    direction?: string;
    mode?: string;
    personId?: string;
    requestId?: string;
  }>();
  const session = useSession();
  const { userId } = session;
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const createRequest = useCreateRequestMutation();
  const amendRequest = useAmendFinancialRequestMutation();

  const { correctionRequestId, contextualPersonId, initialDirection, mode } =
    resolveRegisterRouteParams({
      direction: params.direction,
      mode: params.mode,
      personId: params.personId,
      requestId: params.requestId,
    });
  const isCorrectionMode = mode === 'correction';

  const [query, setQuery] = useState('');
  const [personSearchExpanded, setPersonSearchExpanded] = useState(false);
  const [personId, setPersonId] = useState(contextualPersonId);
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<UserTransactionCategory>(DEFAULT_TRANSACTION_CATEGORY);
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  const [unsavedChangesAlertVisible, setUnsavedChangesAlertVisible] = useState(false);
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
  const [addPersonInitialSearch, setAddPersonInitialSearch] = useState('');
  const registerScrollRef = useRef<ScrollView | null>(null);
  const searchInputRef = useRef<AppTextInputRef | null>(null);
  const amountInputRef = useRef<AppTextInputRef | null>(null);
  const descriptionInputRef = useRef<AppTextInputRef | null>(null);
  const focusedFieldRef = useRef<RegisterFocusTarget | null>(null);
  const footerHeightRef = useRef(0);
  const keyboardOverlapRef = useRef(0);
  const keyboardInsetRef = useRef(0);
  const scrollViewportHeightRef = useRef(0);
  const correctionPrefillKeyRef = useRef<string | null>(null);
  const fieldMetricsRef = useRef<Record<RegisterFocusTarget, FieldMetrics>>({
    amount: { height: 0, y: 0 },
    person: { height: 0, y: 0 },
    description: { height: 0, y: 0 },
  });
  const completedSaveRef = useRef(false);
  const actionFeedback = useActionFeedbackOverlay();
  const activeTheme = useAppTheme();
  const surfaceCardStyle = {
    backgroundColor: activeTheme.colors.surface,
    borderColor: activeTheme.colors.border,
  };
  const errorBorderStyle = { borderColor: activeTheme.colors.danger };

  const allPeople = snapshotQuery.data?.people ?? [];
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const selectedPerson = allPeople.find((person) => person.userId === personId) ?? null;
  const correctionPerson = isCorrectionMode
    ? (snapshotQuery.data?.peopleById[contextualPersonId] ?? null)
    : null;
  const correctionItem = useMemo(
    () =>
      correctionPerson?.pendingItems.find(
        (item) => item.kind === 'financial_request' && item.id === correctionRequestId,
      ) ?? null,
    [correctionPerson?.pendingItems, correctionRequestId],
  );
  const correctionDraft = useMemo(
    () => (correctionItem ? buildCorrectionDraft(correctionItem) : null),
    [correctionItem],
  );
  const correctionPendingContent = useMemo(
    () => (correctionItem ? buildCorrectionPendingContent(correctionItem) : null),
    [correctionItem],
  );
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
  const activeDirectionVisual = directionVisual(direction, activeTheme);
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
  const footerSummaryText = isCorrectionMode
    ? selectedPerson
      ? `Correccion con ${selectedPerson.displayName}: ${
          amountMinor > 0 ? formatCop(amountMinor) : 'sin monto'
        }`
      : 'Correccion del movimiento'
    : summaryText
      ? summaryText
      : draftPreview
        ? draftPreview.summary
        : 'Completa el monto y la persona';
  const addPersonTransactionContext = useMemo(() => {
    if (isCorrectionMode || amountMinor <= 0) {
      return null;
    }

    return {
      amountMinor,
      description: description.trim().length > 0 ? description.trim() : null,
      direction,
    };
  }, [amountMinor, description, direction, isCorrectionMode]);
  const correctionUnavailable =
    isCorrectionMode && !snapshotQuery.isLoading && !snapshotQuery.error && !correctionItem;
  const canShowForm =
    !snapshotQuery.isLoading &&
    !snapshotQuery.error &&
    (isCorrectionMode ? Boolean(correctionItem && selectedPerson) : allPeople.length > 0);
  const isCorrectionDraftDirty =
    isCorrectionMode && correctionDraft
      ? amount !== correctionDraft.amount ||
        category !== correctionDraft.category ||
        description.trim() !== correctionDraft.description
      : false;
  const correctionHistorySteps = useMemo(() => {
    const baseSteps = correctionItem?.pendingHistorySteps ?? [];
    if (!correctionItem || !isCorrectionDraftDirty) {
      return baseSteps;
    }

    return [
      ...baseSteps,
      {
        amountMinor,
        category,
        createdAtLabel: 'Ahora',
        createdByLabel: 'Tu',
        description: description.trim().length > 0 ? description.trim() : 'Sin nota todavia',
        id: `${correctionItem.id}:draft`,
        isCurrent: false,
        status: 'draft',
        title: 'Correccion en edicion',
      },
    ];
  }, [amountMinor, category, correctionItem, description, isCorrectionDraftDirty]);
  const keyboardAwareScrollContentStyle = [
    styles.sheetScrollContent,
    isCorrectionMode ? styles.sheetScrollContentCompact : null,
    { backgroundColor: activeTheme.colors.surface },
    keyboardOverlap > 0
      ? {
          paddingBottom:
            (isCorrectionMode ? theme.spacing.md : theme.spacing.xxl) + keyboardOverlap,
        }
      : null,
  ];
  const isSubmitting = createRequest.isPending || amendRequest.isPending;
  const isDirty =
    isCorrectionMode && correctionDraft
      ? isCorrectionDraftDirty || direction !== correctionDraft.direction
      : amount.trim().length > 0 ||
        category !== DEFAULT_TRANSACTION_CATEGORY ||
        description.trim().length > 0 ||
        personId !== contextualPersonId ||
        direction !== initialDirection;

  usePreventRemove(isDirty && !isSubmitting, ({ data }) => {
    if (completedSaveRef.current) {
      navigation.dispatch(data.action as Parameters<typeof navigation.dispatch>[0]);
      return;
    }

    setUnsavedChangesAlertVisible(true);
    Alert.alert(
      'Tienes cambios sin guardar',
      'Si sales ahora, perderas el movimiento que estas armando.',
      [
        {
          text: 'Seguir editando',
          style: 'cancel',
          onPress: () => setUnsavedChangesAlertVisible(false),
        },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            setUnsavedChangesAlertVisible(false);
            navigation.dispatch(data.action as Parameters<typeof navigation.dispatch>[0]);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => setUnsavedChangesAlertVisible(false),
      },
    );
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const nextKeyboardInset = Math.max(0, event.endCoordinates.height);
      keyboardInsetRef.current = nextKeyboardInset;
      const nextOverlap = updateKeyboardOverlap(nextKeyboardInset);
      if (nextOverlap > 0 && focusedFieldRef.current) {
        scrollFormToField(focusedFieldRef.current, 40);
      }
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardInsetRef.current = 0;
      focusedFieldRef.current = null;
      updateKeyboardOverlap(0);
      registerScrollRef.current?.scrollTo({ animated: true, y: 0 });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isCorrectionMode) {
      correctionPrefillKeyRef.current = null;
      return;
    }

    if (!correctionItem || !correctionDraft) {
      return;
    }

    const nextPrefillKey = [
      correctionRequestId,
      correctionDraft.amount,
      correctionDraft.category,
      correctionDraft.description,
      correctionDraft.direction,
    ].join(':');

    if (correctionPrefillKeyRef.current === nextPrefillKey) {
      return;
    }

    correctionPrefillKeyRef.current = nextPrefillKey;
    setPersonId(contextualPersonId);
    setDirection(correctionDraft.direction);
    setAmount(correctionDraft.amount);
    setCategory(correctionDraft.category);
    setDescription(correctionDraft.description);
    setQuery('');
    setPersonSearchExpanded(false);
    setErrors({});
    setBanner(null);
  }, [contextualPersonId, correctionDraft, correctionItem, correctionRequestId, isCorrectionMode]);

  function updateKeyboardOverlap(nextKeyboardInset = keyboardInsetRef.current): number {
    const nextOverlap = Math.max(0, nextKeyboardInset - footerHeightRef.current - theme.spacing.lg);
    keyboardOverlapRef.current = nextOverlap;
    setKeyboardOverlap(nextOverlap);
    return nextOverlap;
  }

  function recordFieldOffset(field: RegisterFocusTarget) {
    return (event: LayoutChangeEvent) => {
      fieldMetricsRef.current[field] = {
        height: event.nativeEvent.layout.height,
        y: event.nativeEvent.layout.y,
      };
    };
  }

  function scrollFormToField(field: RegisterFocusTarget, delayMs = INPUT_FOCUS_SCROLL_DELAY_MS) {
    focusedFieldRef.current = field;
    setTimeout(() => {
      const fieldMetrics = fieldMetricsRef.current[field];
      const visibleScrollHeight = Math.max(
        MIN_KEYBOARD_SCROLL_HEIGHT,
        scrollViewportHeightRef.current - keyboardOverlapRef.current,
      );
      const fieldBottomOffset = Math.max(
        theme.spacing.sm,
        visibleScrollHeight - fieldMetrics.height - theme.spacing.md - KEYBOARD_SCROLL_GAP,
      );
      const targetY = Math.max(0, fieldMetrics.y - fieldBottomOffset);
      registerScrollRef.current?.scrollTo({ animated: true, y: targetY });
    }, delayMs);
  }

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
      scrollFormToField('person');
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
    backOrReturnTo(router, '/home');
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
      scrollFormToField('amount');
      amountInputRef.current?.focus();
      return;
    }

    if (nextErrors.description) {
      scrollFormToField('description');
      descriptionInputRef.current?.focus();
    }
  }

  function openInviteFlow(suggestedName?: string) {
    closePersonSearch();
    setAddPersonInitialSearch(suggestedName?.trim() ?? '');
    setAddPersonSheetVisible(true);
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

    try {
      setBanner(null);
      let successFocusId: string | null = null;
      const successPersonId = selectedPerson?.userId ?? personId;

      if (isCorrectionMode) {
        if (!correctionRequestId || !correctionItem) {
          setBanner({
            message: 'No encontramos la solicitud pendiente para corregir.',
            tone: 'danger',
          });
          return;
        }

        const response = await actionFeedback.runBlockingAction('amendMovement', () =>
          amendRequest.mutateAsync({
            requestId: correctionRequestId,
            amountMinor,
            category,
            description: description.trim(),
          }),
        );
        successFocusId = readStringField(response, 'amendedRequestId') ?? correctionRequestId;
      } else {
        const debtorUserId = direction === 'i_owe' ? userId : personId;
        const creditorUserId = direction === 'i_owe' ? personId : userId;

        const response = await actionFeedback.runBlockingAction('createMovement', () =>
          createRequest.mutateAsync({
            responderUserId: personId,
            debtorUserId,
            creditorUserId,
            amountMinor,
            category,
            description: description.trim(),
          }),
        );
        successFocusId = readStringField(response, 'requestId');
      }

      setAmount('');
      setCategory(DEFAULT_TRANSACTION_CATEGORY);
      setDescription('');
      setQuery('');
      setErrors({});
      setPersonSearchExpanded(false);
      completedSaveRef.current = true;

      if (successPersonId) {
        returnToRoute(
          router,
          buildRegisterSuccessHref({
            focusId: successFocusId,
            panel: 'pending',
            personId: successPersonId,
          }),
        );
      } else {
        closeRegister();
      }

      setTimeout(() => {
        showGlobalFeedback({
          title: isCorrectionMode ? 'Correccion enviada' : 'Movimiento creado',
          message: `Con ${selectedPerson?.displayName ?? 'la otra persona'}.`,
          tone: 'success',
        });
      }, 220);
    } catch (error) {
      const nextMessage =
        error instanceof Error
          ? error.message
          : isCorrectionMode
            ? 'No se pudo enviar la correccion.'
            : 'No se pudo guardar el movimiento.';
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
      await actionFeedback.showResult({
        message: 'Intenta nuevamente',
        title: 'No se pudo',
        variant: 'danger',
      });
    }
  }

  const refreshConfig: BrandedRefreshProps | undefined = canShowForm ? refresh : undefined;

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[
        styles.safeArea,
        {
          backgroundColor: unsavedChangesAlertVisible
            ? activeTheme.colors.transparent
            : activeTheme.colors.overlay,
        },
      ]}
    >
      <Pressable onPress={closeRegister} style={styles.backdropTapTarget} />

      <View
        style={[
          styles.layout,
          isCorrectionMode ? styles.layoutCompact : styles.layoutTall,
          { backgroundColor: activeTheme.colors.surface },
          activeTheme.shadow.floating,
        ]}
      >
        <View style={styles.fixedTop}>
          <View style={[styles.sheetHandle, { backgroundColor: activeTheme.colors.accent }]} />
          <View style={styles.heroRow}>
            <AppText style={styles.heroTitle}>
              {isCorrectionMode ? 'Correccion del movimiento' : 'Nuevo movimiento'}
            </AppText>
            <Pressable
              onPress={closeRegister}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: activeTheme.colors.surfaceMuted },
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Ionicons color={activeTheme.colors.text} name="close" size={20} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.panelArea, isCorrectionMode ? styles.panelAreaCompact : null]}>
          {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

          <View
            onLayout={(event) => {
              scrollViewportHeightRef.current = event.nativeEvent.layout.height;
            }}
            style={[
              styles.sheetScrollWrap,
              isCorrectionMode ? styles.sheetScrollWrapCompact : null,
            ]}
          >
            <BrandedRefreshScrollView
              contentContainerStyle={keyboardAwareScrollContentStyle}
              fillViewport={!isCorrectionMode}
              keyboardShouldPersistTaps="handled"
              ref={registerScrollRef}
              refresh={refreshConfig}
              showsVerticalScrollIndicator={false}
            >
              {snapshotQuery.isLoading ? (
                <View style={styles.loadingState}>
                  <View style={styles.loadingMotion}>
                    <HappyCirclesMotion size={88} variant="loading" />
                  </View>
                  <AppText style={styles.supportText}>Cargando relaciones activas...</AppText>
                </View>
              ) : null}

              {snapshotQuery.error ? (
                <View style={styles.loadingState}>
                  <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
                </View>
              ) : null}

              {!isCorrectionMode &&
              !snapshotQuery.isLoading &&
              !snapshotQuery.error &&
              allPeople.length === 0 ? (
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

              {correctionUnavailable ? (
                <View style={styles.emptyState}>
                  <EmptyState
                    description="Puede que ya haya sido respondida o reemplazada por otra propuesta."
                    title="Correccion no disponible"
                  />
                </View>
              ) : null}

              {canShowForm ? (
                <>
                  <View style={styles.formContent}>
                    {isCorrectionMode &&
                    selectedPerson &&
                    correctionItem &&
                    correctionPendingContent ? (
                      <PendingFinancialRequestCard
                        actionsVisible={false}
                        actorAvatarUrl={selectedPerson.avatarUrl ?? null}
                        amountMinor={correctionItem.amountMinor ?? 0}
                        amountTone={
                          correctionItem.tone === 'positive' || correctionItem.tone === 'negative'
                            ? correctionItem.tone
                            : 'neutral'
                        }
                        category={correctionItem.category}
                        counterpartyName={selectedPerson.displayName}
                        createdAtLabel={correctionPendingContent.createdAtLabel}
                        createdByLabel={correctionPendingContent.createdByLabel}
                        description={correctionPendingContent.detail}
                        historySteps={correctionHistorySteps}
                        isExpanded
                        responseState={
                          correctionItem.status === 'requires_you'
                            ? 'requires_you'
                            : 'waiting_other_side'
                        }
                        title={correctionItem.title}
                      />
                    ) : null}

                    <View
                      onLayout={recordFieldOffset('amount')}
                      style={[
                        styles.amountCard,
                        surfaceCardStyle,
                        errors.amount ? errorBorderStyle : null,
                      ]}
                    >
                      <View style={styles.amountDisplayRow}>
                        <AppText
                          style={[
                            styles.currencySymbol,
                            { color: activeDirectionVisual.accentColor },
                          ]}
                        >
                          $
                        </AppText>
                        <AppTextInput
                          chrome="plain"
                          keyboardType="number-pad"
                          onFocus={() => scrollFormToField('amount')}
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
                        <AppText style={styles.inlineError}>Ingresa un monto valido</AppText>
                      ) : null}
                    </View>

                    {!isCorrectionMode ? (
                      <>
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

                        <View onLayout={recordFieldOffset('person')} style={styles.fieldStack}>
                          <View style={styles.labelRow}>
                            <AppText style={styles.sectionLabel}>Persona</AppText>
                            {errors.personId ? (
                              <AppText style={styles.inlineError}>Selecciona una persona</AppText>
                            ) : null}
                          </View>
                          <Pressable
                            onPress={() => {
                              clearFieldError('personId');
                              togglePersonSearch();
                            }}
                            style={({ pressed }) => [
                              styles.personPrimaryCard,
                              surfaceCardStyle,
                              errors.personId ? errorBorderStyle : null,
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
                                  <AppText numberOfLines={1} style={styles.personPrimaryName}>
                                    {selectedPerson.displayName}
                                  </AppText>
                                  <AppText numberOfLines={1} style={styles.personPrimaryMeta}>
                                    {contextualPersonId === selectedPerson.userId
                                      ? 'Seleccionada desde personas'
                                      : 'Toca para cambiar o invitar'}
                                  </AppText>
                                </View>
                              </>
                            ) : (
                              <View style={styles.personPrimaryCopy}>
                                <AppText style={styles.personPrimaryName}>
                                  Seleccionar persona
                                </AppText>
                                <AppText style={styles.personPrimaryMeta}>Buscar o invitar</AppText>
                              </View>
                            )}
                            <Ionicons
                              color={activeTheme.colors.textMuted}
                              name={personSearchExpanded ? 'chevron-up' : 'chevron-forward'}
                              size={20}
                            />
                          </Pressable>
                          {personSearchExpanded ? (
                            <View style={styles.personSearchPanel}>
                              <AppTextInput
                                autoCapitalize="words"
                                clearButtonMode="while-editing"
                                density="compact"
                                onFocus={() => scrollFormToField('person')}
                                onChangeText={setQuery}
                                placeholder="Buscar otra persona"
                                placeholderTextColor={activeTheme.colors.muted}
                                ref={searchInputRef}
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
                                          surfaceCardStyle,
                                          pressed ? styles.personOptionPressed : null,
                                        ]}
                                      >
                                        <AppAvatar
                                          imageUrl={person.avatarUrl ?? null}
                                          label={person.displayName}
                                          size={40}
                                        />
                                        <View style={styles.personOptionCopy}>
                                          <AppText
                                            numberOfLines={1}
                                            style={styles.personOptionName}
                                          >
                                            {person.displayName}
                                          </AppText>
                                          <AppText
                                            numberOfLines={1}
                                            style={styles.personOptionMeta}
                                          >
                                            Relacion activa
                                          </AppText>
                                        </View>
                                      </Pressable>
                                    ))}
                                  </View>
                                ) : (
                                  <View style={styles.personSearchEmptyState}>
                                    <AppText style={styles.supportTitle}>
                                      No encontramos a esa persona.
                                    </AppText>
                                    <AppText style={styles.supportText}>
                                      Puedes invitarla sin salir de este flujo.
                                    </AppText>
                                    <PrimaryAction
                                      label="Invitar persona"
                                      onPress={() => openInviteFlow(normalizedQuery)}
                                      variant="secondary"
                                    />
                                  </View>
                                )
                              ) : (
                                <AppText style={styles.personSearchHint}>
                                  Escribe un nombre y te mostraremos coincidencias aqui mismo.
                                </AppText>
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
                      </>
                    ) : null}

                    <View style={styles.fieldStack}>
                      <AppText style={styles.sectionLabel}>Categoria</AppText>
                      <TransactionCategoryPicker
                        onChange={setCategory}
                        value={category}
                        variant="carousel"
                      />
                    </View>

                    <View onLayout={recordFieldOffset('description')} style={styles.fieldStack}>
                      <View style={styles.labelRow}>
                        <AppText style={styles.sectionLabel}>Nota</AppText>
                        {errors.description ? (
                          <AppText style={styles.inlineError}>Es obligatoria</AppText>
                        ) : null}
                      </View>
                      <AppTextInput
                        density="compact"
                        hasError={Boolean(errors.description)}
                        onFocus={() => scrollFormToField('description')}
                        onChangeText={(value) => {
                          setDescription(value);
                          clearFieldError('description');
                        }}
                        placeholder="Ej. Pizza del viernes"
                        placeholderTextColor={activeTheme.colors.muted}
                        ref={descriptionInputRef}
                        returnKeyType="done"
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
          <View
            onLayout={(event) => {
              footerHeightRef.current = event.nativeEvent.layout.height;
              updateKeyboardOverlap();
            }}
            style={styles.footer}
          >
            <View
              style={[styles.footerSummary, { backgroundColor: activeTheme.colors.primarySoft }]}
            >
              <AppText numberOfLines={1} style={styles.footerSummaryText}>
                {footerSummaryText}
              </AppText>
              {selectedPerson ? (
                <View style={styles.footerCategoryBadge}>
                  <View
                    style={[styles.footerCategoryIcon, { backgroundColor: categoryIconBackground }]}
                  >
                    <Ionicons color={categoryIconColor} name={categoryIconName} size={14} />
                  </View>
                  <AppText numberOfLines={1} style={styles.footerCategoryText}>
                    {transactionCategoryLabel(category)}
                  </AppText>
                </View>
              ) : null}
            </View>
            <ScreenFinalAction
              anchored={false}
              bottomPadding={false}
              disabled={isSubmitting}
              label={
                isSubmitting
                  ? isCorrectionMode
                    ? 'Enviando...'
                    : 'Creando...'
                  : isCorrectionMode
                    ? 'Enviar correccion'
                    : 'Registrar'
              }
              loading={isSubmitting}
              onPress={isSubmitting ? undefined : () => void handleSave()}
            />
          </View>
        ) : null}
      </View>

      <TransactionActionFeedbackOverlay
        amountLabel={formatCop(amountMinor)}
        category={category}
        direction={direction}
        isCorrection={isCorrectionMode}
        message={actionFeedback.overlayProps.message}
        personLabel={selectedPerson?.displayName ?? null}
        title={actionFeedback.overlayProps.title}
        variant={actionFeedback.overlayProps.variant}
        visible={actionFeedback.overlayProps.visible}
      />
      <AddPersonContactsSheet
        currentUserAvatarUrl={currentUserProfile?.avatarUrl ?? null}
        currentUserLabel={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
        initialSearchValue={addPersonInitialSearch}
        onClose={() => setAddPersonSheetVisible(false)}
        transactionContext={addPersonTransactionContext}
        visible={addPersonSheetVisible}
      />
    </SafeAreaView>
  );
}
