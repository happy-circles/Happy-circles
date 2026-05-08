import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
} from 'react-native';
import { Animated, Easing, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import type { AddPersonTransactionContext } from '@/features/home/contacts-sheet-helpers';
import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

const IN_PERSON_EXPANDED_HEIGHT = 112;
const IN_PERSON_COMPACT_SCROLL_DISTANCE = 96;
const IN_PERSON_COMPACT_ACTIONS_WIDTH = 90;
const IN_PERSON_COMPACT_ENABLE_Y = 76;
const IN_PERSON_COMPACT_DISABLE_Y = 12;
const IN_PERSON_SNAP_EQUILIBRIUM_Y = IN_PERSON_COMPACT_SCROLL_DISTANCE / 2;

export function useAddPersonInPersonMorph(visible: boolean) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const morphY = useRef(new Animated.Value(0)).current;
  const snapTargetRef = useRef<{ scrollY: number; visualY: number } | null>(null);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);

  const updateCompact = useCallback((nextCompact: boolean) => {
    if (compactRef.current === nextCompact) {
      return;
    }

    compactRef.current = nextCompact;
    setCompact(nextCompact);
  }, []);

  const updateInteractiveState = useCallback(
    (y: number) => {
      if (!compactRef.current && y >= IN_PERSON_COMPACT_ENABLE_Y) {
        updateCompact(true);
        return;
      }

      if (compactRef.current && y <= IN_PERSON_COMPACT_DISABLE_Y) {
        updateCompact(false);
      }
    },
    [updateCompact],
  );

  const getMaxScrollY = useCallback(
    () => Math.max(0, contentHeightRef.current - viewportHeightRef.current),
    [],
  );

  const scrollYToMorphY = useCallback(
    (rawY: number) => {
      const maxScrollY = getMaxScrollY();

      if (maxScrollY <= 0) {
        return 0;
      }

      const y = Math.min(maxScrollY, Math.max(0, rawY));

      if (maxScrollY < IN_PERSON_COMPACT_SCROLL_DISTANCE) {
        return (y / maxScrollY) * IN_PERSON_COMPACT_SCROLL_DISTANCE;
      }

      return Math.min(IN_PERSON_COMPACT_SCROLL_DISTANCE, y);
    },
    [getMaxScrollY],
  );

  const morphYToScrollY = useCallback(
    (visualY: number) => {
      const maxScrollY = getMaxScrollY();

      if (maxScrollY <= 0) {
        return 0;
      }

      const y = Math.min(IN_PERSON_COMPACT_SCROLL_DISTANCE, Math.max(0, visualY));

      if (maxScrollY < IN_PERSON_COMPACT_SCROLL_DISTANCE) {
        return (y / IN_PERSON_COMPACT_SCROLL_DISTANCE) * maxScrollY;
      }

      return y;
    },
    [getMaxScrollY],
  );

  useEffect(() => {
    if (visible) {
      snapTargetRef.current = null;
      morphY.stopAnimation();
      morphY.setValue(0);
      updateCompact(false);
    }
  }, [morphY, updateCompact, visible]);

  const onScrollBeginDrag = useCallback<NonNullable<ScrollViewProps['onScrollBeginDrag']>>(
    (event) => {
      const y = scrollYToMorphY(event.nativeEvent.contentOffset.y);

      snapTargetRef.current = null;
      morphY.stopAnimation();
      morphY.setValue(y);
      updateInteractiveState(y);
    },
    [morphY, scrollYToMorphY, updateInteractiveState],
  );

  const onScroll = useCallback<NonNullable<ScrollViewProps['onScroll']>>(
    (event) => {
      const rawY = Math.max(0, event.nativeEvent.contentOffset.y);
      const snapTarget = snapTargetRef.current;

      if (snapTarget !== null) {
        updateInteractiveState(snapTarget.visualY);
        return;
      }

      const y = scrollYToMorphY(rawY);

      morphY.setValue(y);
      updateInteractiveState(y);
    },
    [morphY, scrollYToMorphY, updateInteractiveState],
  );

  const settleTransition = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (snapTargetRef.current !== null) {
        return;
      }

      const y = scrollYToMorphY(event.nativeEvent.contentOffset.y);

      updateInteractiveState(y);

      if (y <= 0 || y >= IN_PERSON_COMPACT_SCROLL_DISTANCE) {
        morphY.stopAnimation();
        morphY.setValue(Math.min(IN_PERSON_COMPACT_SCROLL_DISTANCE, y));
        return;
      }

      const targetY = y >= IN_PERSON_SNAP_EQUILIBRIUM_Y ? IN_PERSON_COMPACT_SCROLL_DISTANCE : 0;
      const scrollTargetY = morphYToScrollY(targetY);

      snapTargetRef.current = { scrollY: scrollTargetY, visualY: targetY };
      updateCompact(targetY === IN_PERSON_COMPACT_SCROLL_DISTANCE);
      morphY.stopAnimation();
      Animated.timing(morphY, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: targetY,
        useNativeDriver: false,
      }).start(({ finished }) => {
        const currentTarget = snapTargetRef.current;

        if (currentTarget?.scrollY !== scrollTargetY || currentTarget.visualY !== targetY) {
          return;
        }

        snapTargetRef.current = null;

        if (finished) {
          morphY.setValue(targetY);
          updateInteractiveState(targetY);
        }
      });
      scrollViewRef.current?.scrollTo({ animated: true, y: scrollTargetY });
    },
    [morphY, morphYToScrollY, scrollYToMorphY, updateCompact, updateInteractiveState],
  );

  const onContentSizeChange = useCallback<NonNullable<ScrollViewProps['onContentSizeChange']>>(
    (_contentWidth, contentHeight) => {
      contentHeightRef.current = contentHeight;
    },
    [],
  );

  const onLayout = useCallback<NonNullable<ScrollViewProps['onLayout']>>((event) => {
    viewportHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const progress = morphY.interpolate({
    inputRange: [0, IN_PERSON_COMPACT_SCROLL_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return {
    compact,
    compactActionsOpacity: progress.interpolate({
      inputRange: [0, 0.56, 0.94],
      outputRange: [0, 0, 1],
      extrapolate: 'clamp',
    }),
    compactActionsTranslateX: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [10, 0],
      extrapolate: 'clamp',
    }),
    compactActionsWidth: progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0, IN_PERSON_COMPACT_ACTIONS_WIDTH],
      extrapolate: 'clamp',
    }),
    expandedActionLabelOpacity: progress.interpolate({
      inputRange: [0, 0.28, 0.66],
      outputRange: [1, 1, 0],
      extrapolate: 'clamp',
    }),
    expandedActionLabelWidth: progress.interpolate({
      inputRange: [0, 0.2, 0.72],
      outputRange: [86, 86, 0],
      extrapolate: 'clamp',
    }),
    expandedActionsTranslateY: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -28],
      extrapolate: 'clamp',
    }),
    expandedBlockOpacity: progress.interpolate({
      inputRange: [0, 0.45, 1],
      outputRange: [1, 0.78, 0],
      extrapolate: 'clamp',
    }),
    expandedCopyOpacity: progress.interpolate({
      inputRange: [0, 0.28, 0.58],
      outputRange: [1, 1, 0],
      extrapolate: 'clamp',
    }),
    expandedCopyTranslateY: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -8],
      extrapolate: 'clamp',
    }),
    onContentSizeChange,
    onLayout,
    onMomentumScrollEnd: settleTransition,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag: settleTransition,
    scrollViewRef,
    slotHeight: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [IN_PERSON_EXPANDED_HEIGHT, 0],
      extrapolate: 'clamp',
    }),
    slotMarginBottom: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [theme.spacing.md, 0],
      extrapolate: 'clamp',
    }),
  };
}

export function AddPersonInPersonControls({
  busyKey,
  morph,
  onOpenScanner,
  onShowMyQr,
  searchValue,
  setSearchValue,
  transactionContext,
}: {
  readonly busyKey: string | null;
  readonly morph: ReturnType<typeof useAddPersonInPersonMorph>;
  readonly onOpenScanner: () => void;
  readonly onShowMyQr: () => void;
  readonly searchValue: string;
  readonly setSearchValue: (value: string) => void;
  readonly transactionContext?: AddPersonTransactionContext | null;
}) {
  return (
    <View style={styles.contactControlsStack}>
      <Animated.View
        accessibilityElementsHidden={morph.compact}
        importantForAccessibility={morph.compact ? 'no-hide-descendants' : 'auto'}
        pointerEvents={morph.compact ? 'none' : 'auto'}
        style={[
          styles.inPersonCollapseSlot,
          {
            height: morph.slotHeight,
            marginBottom: morph.slotMarginBottom,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.inPersonBlock,
            {
              height: IN_PERSON_EXPANDED_HEIGHT,
              opacity: morph.expandedBlockOpacity,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.inPersonCopy,
              {
                opacity: morph.expandedCopyOpacity,
                transform: [{ translateY: morph.expandedCopyTranslateY }],
              },
            ]}
          >
            <AppText style={styles.inPersonTitle}>Conectar en persona</AppText>
            <AppText style={styles.inPersonText}>Usa QR cuando ya estan juntos.</AppText>
          </Animated.View>
          <Animated.View
            style={[
              styles.inPersonActions,
              { transform: [{ translateY: morph.expandedActionsTranslateY }] },
            ]}
          >
            <Pressable
              accessibilityLabel="Escanear QR"
              accessibilityRole="button"
              onPress={onOpenScanner}
              style={({ pressed }) => [styles.qrActionButton, pressed ? styles.pressed : null]}
            >
              <Ionicons color={theme.colors.text} name="camera-outline" size={18} />
              <Animated.View
                style={[
                  styles.qrActionLabelClip,
                  {
                    opacity: morph.expandedActionLabelOpacity,
                    width: morph.expandedActionLabelWidth,
                  },
                ]}
              >
                <AppText numberOfLines={1} style={styles.qrActionText}>
                  Escanear QR
                </AppText>
              </Animated.View>
            </Pressable>
            <Pressable
              accessibilityLabel={busyKey === 'my-qr' ? 'Creando mi QR' : 'Mostrar mi QR'}
              accessibilityRole="button"
              disabled={busyKey === 'my-qr'}
              onPress={onShowMyQr}
              style={({ pressed }) => [
                styles.qrActionButton,
                styles.qrActionButtonPrimary,
                pressed ? styles.pressed : null,
                busyKey === 'my-qr' ? styles.disabled : null,
              ]}
            >
              <Ionicons color={theme.colors.white} name="qr-code-outline" size={18} />
              <Animated.View
                style={[
                  styles.qrActionLabelClip,
                  {
                    opacity: morph.expandedActionLabelOpacity,
                    width: morph.expandedActionLabelWidth,
                  },
                ]}
              >
                <AppText
                  numberOfLines={1}
                  style={[styles.qrActionText, styles.qrActionTextPrimary]}
                >
                  {busyKey === 'my-qr' ? 'Creando...' : 'Mi QR'}
                </AppText>
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {transactionContext ? (
        <View style={styles.contextBlock}>
          <AppText style={styles.contextLabel}>Contexto</AppText>
          <AppText style={styles.contextBody}>
            {transactionContext.direction === 'i_owe' ? 'Salida' : 'Entrada'} de{' '}
            {formatCop(transactionContext.amountMinor)}
            {transactionContext.description && transactionContext.description.trim().length > 0
              ? ` por ${transactionContext.description.trim()}`
              : ''}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.searchWrap, transactionContext ? styles.searchWrapSpaced : null]}>
        <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
        <AppTextInput
          autoCapitalize="words"
          autoCorrect={false}
          chrome="plain"
          density="compact"
          onChangeText={setSearchValue}
          placeholder="Buscar en contactos"
          placeholderTextColor={theme.colors.muted}
          style={styles.searchInput}
          value={searchValue}
        />
        <Animated.View
          accessibilityElementsHidden={!morph.compact}
          importantForAccessibility={morph.compact ? 'auto' : 'no-hide-descendants'}
          pointerEvents={morph.compact ? 'auto' : 'none'}
          style={[
            styles.compactQrActions,
            {
              opacity: morph.compactActionsOpacity,
              transform: [{ translateX: morph.compactActionsTranslateX }],
              width: morph.compactActionsWidth,
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Escanear QR"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onOpenScanner}
            style={({ pressed }) => [styles.compactQrButton, pressed ? styles.pressed : null]}
          >
            <Ionicons color={theme.colors.text} name="camera-outline" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel={busyKey === 'my-qr' ? 'Creando mi QR' : 'Mostrar mi QR'}
            accessibilityRole="button"
            disabled={busyKey === 'my-qr'}
            hitSlop={8}
            onPress={onShowMyQr}
            style={({ pressed }) => [
              styles.compactQrButton,
              styles.compactQrButtonPrimary,
              pressed ? styles.pressed : null,
              busyKey === 'my-qr' ? styles.disabled : null,
            ]}
          >
            <Ionicons
              color={theme.colors.white}
              name={busyKey === 'my-qr' ? 'sync-outline' : 'qr-code-outline'}
              size={20}
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
