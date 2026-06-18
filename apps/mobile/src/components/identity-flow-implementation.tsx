import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type {
  KeyboardEvent,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import {
  AppTextInput,
  getCurrentlyFocusedTextInput,
  type AppTextInputProps,
  type AppTextInputRef,
} from '@/components/app-text-input';
import { PasswordTextInput, type PasswordTextInputProps } from '@/components/password-text-input';
import {
  BRAND_VERIFICATION_EASING,
  BrandVerificationMark,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import { LaunchIntroTargetView } from '@/components/launch-intro-presence';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell, type ScreenShellProps } from '@/components/screen-shell';
import {
  registerIdentityFlowScrollView,
  registerIdentityFlowKeyboardResetForHandoff,
  scrollIdentityFlowToTop,
  updateIdentityFlowScrollMetrics,
  type IdentityFlowTransitionScrollPolicy,
} from '@/lib/identity-flow-scroll';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import {
  resolveIdentityFlowLayout,
  resolveIdentityFlowVisualOffset,
  type IdentityFlowCenterLayout,
  type IdentityFlowIdentityPosition,
} from './identity-flow-helpers';
import { resolveFieldVisual, type IdentityFlowFieldStatus } from './identity-flow-field-visual';

export const IDENTITY_FLOW_CONTENT_MAX_WIDTH = 460;
export const IDENTITY_FLOW_STAGE_SIZE = 208;
export const IDENTITY_FLOW_COMPACT_FACE_SIZE = 160;
export const IDENTITY_FLOW_PROFILE_AVATAR_SIZE = 88;
export const IDENTITY_FLOW_FIELD_HEIGHT = 56;
export const IDENTITY_FLOW_FIELD_ICON_SIZE = 40;
export const IDENTITY_FLOW_HEADER_TITLE = 'Happy Circles';
const IDENTITY_FLOW_AVATAR_OUTER_ROTATION_DEGREES = -45;
const IDENTITY_FLOW_AVATAR_EDIT_PENCIL_OFFSET = 35;
const IDENTITY_FLOW_AVATAR_EDIT_PENCIL_SIZE = 32;
const IDENTITY_FLOW_ACTION_AFTER_KEYBOARD_DISMISS_MS = 90;
const IDENTITY_FLOW_FIELD_ERROR_HEIGHT = 24;
const IDENTITY_FLOW_ACTIONS_MIN_HEIGHT = 56;
const IDENTITY_FLOW_ACTIONS_MIN_GAP = theme.spacing.lg;
export const IDENTITY_FLOW_LARGE_FACE_VIEW_BOX = '222 222 236 236';
const IDENTITY_FLOW_MESSAGE_SLOT_HEIGHT = 72;
const IDENTITY_FLOW_SCREEN_TITLE_LINE_HEIGHT = 28;
const IDENTITY_FLOW_TOP_OFFSET = theme.spacing.xl + theme.spacing.md;
const IDENTITY_FLOW_STAGE_TRANSITION_MS = 780;
const IDENTITY_FLOW_CONTENT_ENTER_DISTANCE = 8;
const IDENTITY_FLOW_CONTENT_HIDDEN_OPACITY = 0.18;
const IDENTITY_FLOW_CONTENT_ENTER_MS = 240;
const IDENTITY_FLOW_CONTENT_EXIT_MS = 140;
const IDENTITY_FLOW_CONTENT_MORPH_MS = 260;
const IDENTITY_FLOW_FITTED_SCROLL_SETTLE_FRAMES = 18;
const IDENTITY_FLOW_KEYBOARD_FIELD_GAP = theme.spacing.md;
const IDENTITY_FLOW_KEYBOARD_SCROLL_RESET_THRESHOLD = 8;

export type IdentityFlowCenterFaceSize = 'large' | 'small';
export type { IdentityFlowCenterLayout, IdentityFlowIdentityPosition };
export type { IdentityFlowFieldStatus };

type MeasurableNativeNode = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

type KeyboardFrameSnapshot = {
  readonly top: number;
};

type IdentityFlowContentSnapshot = {
  readonly children: ReactNode;
  readonly message?: ReactNode;
  readonly shouldReserveMessageSlot: boolean;
  readonly transitionKey?: string;
};

const IdentityFlowKeyboardAvoidanceContext = createContext<(() => void) | null>(null);

interface IdentityFlowScreenProps extends Pick<
  ScreenShellProps,
  'footer' | 'overlay' | 'refresh' | 'safeAreaEdges' | 'scrollEnabled' | 'scrollViewRef'
> {
  readonly actions?: ReactNode;
  readonly bodyStyle?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
  readonly contentTransitionKey?: string;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly contentVisible?: boolean;
  readonly contentWidthStyle?: StyleProp<ViewStyle>;
  readonly fitContentToScreen?: boolean;
  readonly identity?: ReactNode;
  readonly identityCenterLayout?: IdentityFlowCenterLayout;
  readonly identityPosition?: IdentityFlowIdentityPosition;
  readonly keyboardActionClearance?: number;
  readonly keyboardVerticalOffset?: number;
  readonly message?: ReactNode;
  readonly preserveActionsDuringContentTransition?: boolean;
  readonly transitionScrollPolicy?: IdentityFlowTransitionScrollPolicy;
}

export function IdentityFlowScreen({
  actions,
  bodyStyle,
  children,
  contentTransitionKey,
  contentStyle,
  contentVisible = true,
  contentWidthStyle,
  fitContentToScreen = false,
  footer,
  identity,
  identityCenterLayout = 'balanced',
  identityPosition = 'auto',
  keyboardActionClearance,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 24 : 0,
  message,
  overlay,
  preserveActionsDuringContentTransition = false,
  refresh,
  safeAreaEdges = ['left', 'right'],
  scrollEnabled = true,
  scrollViewRef,
  transitionScrollPolicy = 'preserve',
}: IdentityFlowScreenProps) {
  const activeTheme = useAppTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [measuredViewportHeight, setMeasuredViewportHeight] = useState(0);
  const browserViewportHeight = (() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return 0;
    }

    const viewportHeights = [
      window.innerHeight,
      window.document?.documentElement?.clientHeight,
      window.visualViewport?.height,
    ].filter(
      (height): height is number =>
        typeof height === 'number' && Number.isFinite(height) && height > 0,
    );

    return viewportHeights.length > 0 ? Math.min(...viewportHeights) : 0;
  })();
  const viewportHeightLimit = browserViewportHeight || windowHeight;
  const viewportHeight =
    measuredViewportHeight > 0
      ? Math.min(measuredViewportHeight, viewportHeightLimit)
      : viewportHeightLimit;
  const insets = useSafeAreaInsets();
  const shouldUseManualKeyboardLift = Platform.OS === 'ios';
  const bottomInset = Math.max(0, insets.bottom);
  const screenBackgroundColor = activeTheme.colors.background;
  const screenTitleTop = Math.max(0, insets.top) + theme.spacing.xxs;
  const screenTitleClearance = fitContentToScreen ? theme.spacing.xs : theme.spacing.lg;
  const titleClearedTopOffset = Math.max(
    IDENTITY_FLOW_TOP_OFFSET,
    screenTitleTop + IDENTITY_FLOW_SCREEN_TITLE_LINE_HEIGHT + screenTitleClearance,
  );
  const fallbackScrollViewRef = useRef<ScrollView | null>(null);
  const activeScrollViewRef = scrollViewRef ?? fallbackScrollViewRef;
  const keyboardEventRef = useRef<KeyboardEvent | null>(null);
  const keyboardFrameRef = useRef<KeyboardFrameSnapshot | null>(null);
  const keyboardAdjustmentFrameRef = useRef<number | null>(null);
  const keyboardAdjustmentGenerationRef = useRef(0);
  const keyboardRevealBaseScrollYRef = useRef<number | null>(null);
  const keyboardRevealTargetScrollYRef = useRef<number | null>(null);
  const scrollYRef = useRef(0);
  const resolvedFooter =
    actions && footer ? (
      <>
        {actions}
        {footer}
      </>
    ) : (
      (actions ?? footer)
    );
  const [actionStackHeight, setActionStackHeight] = useState(0);
  const lockedBodyHeightRef = useRef(0);
  const usedFallbackBodyHeightRef = useRef(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [hasMeasuredBody, setHasMeasuredBody] = useState(false);
  const visualBodyHeight = Math.max(
    0,
    viewportHeight - Math.max(0, insets.top) - bottomInset - theme.spacing.xl,
  );
  const layoutBodyHeight =
    bodyHeight > 0 && visualBodyHeight > 0 ? Math.min(bodyHeight, visualBodyHeight) : bodyHeight;
  const layoutReady = hasMeasuredBody && layoutBodyHeight > 0;
  const actionStackMeasuredHeight =
    actionStackHeight > 0 ? actionStackHeight : IDENTITY_FLOW_ACTIONS_MIN_HEIGHT;
  const actionStackLayoutHeight = resolvedFooter
    ? actionStackMeasuredHeight + IDENTITY_FLOW_ACTIONS_MIN_GAP * 2
    : 0;
  const fittedContentClearance = fitContentToScreen ? theme.spacing.md : 0;
  const measuredFlowHeight = fitContentToScreen
    ? contentHeight + actionStackLayoutHeight + fittedContentClearance
    : 0;
  const actionStackKeyboardClearance = actionStackMeasuredHeight + IDENTITY_FLOW_KEYBOARD_FIELD_GAP;
  const resolvedKeyboardActionClearance =
    keyboardActionClearance ??
    (resolvedFooter
      ? Math.max(IDENTITY_FLOW_KEYBOARD_FIELD_GAP, actionStackKeyboardClearance)
      : IDENTITY_FLOW_KEYBOARD_FIELD_GAP);
  const layoutMetrics = resolveIdentityFlowLayout({
    bodyHeight: layoutBodyHeight,
    centerLayout: identityCenterLayout,
    contentHeight: measuredFlowHeight,
    hasMessage: message !== undefined,
    identityPosition,
    layoutReady,
    stageSize: IDENTITY_FLOW_STAGE_SIZE,
    topOffset: titleClearedTopOffset,
    verticalGap: theme.spacing.sm,
  });
  const isCenterIdentity = layoutMetrics.isCenterIdentity;
  const shouldReserveMessageSlot = layoutMetrics.shouldReserveMessageSlot;
  const currentContentSnapshot: IdentityFlowContentSnapshot = {
    children,
    message,
    shouldReserveMessageSlot,
    transitionKey: contentTransitionKey,
  };
  const identityMotion = useRef(new Animated.Value(isCenterIdentity ? 0 : 1)).current;
  const contentMotion = useRef(new Animated.Value(contentVisible ? 1 : 0)).current;
  const contentSwapMotion = useRef(new Animated.Value(1)).current;
  const previousContentTransitionKeyRef = useRef(contentTransitionKey);
  const currentContentSnapshotRef = useRef(currentContentSnapshot);
  currentContentSnapshotRef.current = currentContentSnapshot;
  const activeContentSnapshotRef = useRef<IdentityFlowContentSnapshot>(currentContentSnapshot);
  const [previousContentSnapshot, setPreviousContentSnapshot] =
    useState<IdentityFlowContentSnapshot | null>(null);
  const topIdentityY = layoutMetrics.topIdentityY;
  const centerIdentityY = layoutMetrics.centerIdentityY;
  const topContentY = layoutMetrics.topContentY;
  const centerContentY = layoutMetrics.centerContentY;
  const contentLayoutY = isCenterIdentity ? centerContentY : topContentY;
  const identityLayoutY = isCenterIdentity ? centerIdentityY : topIdentityY;
  const identityTranslateY = identityMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [centerIdentityY, topIdentityY],
  });
  const contentEnterTranslateY = contentMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [IDENTITY_FLOW_CONTENT_ENTER_DISTANCE, 0],
  });
  const contentOpacity = contentMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [IDENTITY_FLOW_CONTENT_HIDDEN_OPACITY, 1],
  });
  const currentContentSwapStyle = previousContentSnapshot
    ? {
        opacity: contentSwapMotion,
        transform: [
          {
            translateY: contentSwapMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [3, 0],
            }),
          },
        ],
      }
    : undefined;
  const previousContentSwapStyle = previousContentSnapshot
    ? {
        opacity: contentSwapMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0],
        }),
        transform: [
          {
            translateY: contentSwapMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -3],
            }),
          },
        ],
      }
    : undefined;
  const transitionedActionStack = resolvedFooter ? (
    <Animated.View
      onLayout={(event) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        setActionStackHeight((currentHeight) =>
          Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight,
        );
      }}
      style={[
        styles.transitionedActionStack,
        {
          opacity: layoutReady ? (preserveActionsDuringContentTransition ? 1 : contentOpacity) : 0,
          transform: preserveActionsDuringContentTransition
            ? undefined
            : [{ translateY: contentEnterTranslateY }],
        },
      ]}
    >
      <View style={styles.actionStack}>{resolvedFooter}</View>
    </Animated.View>
  ) : undefined;
  const fittedScrollClearance = fitContentToScreen ? theme.spacing.xs : 0;
  const contentBottomPadding = theme.spacing.xl + bottomInset + fittedScrollClearance;
  const shouldRenderInlineActionStack = Boolean(transitionedActionStack);
  const actionFlowSpacerHeight = shouldRenderInlineActionStack
    ? Math.max(
        IDENTITY_FLOW_ACTIONS_MIN_GAP,
        layoutBodyHeight -
          contentLayoutY -
          contentHeight -
          actionStackMeasuredHeight -
          IDENTITY_FLOW_ACTIONS_MIN_GAP,
      )
    : 0;
  const actionStackAnchorTop = shouldRenderInlineActionStack
    ? layoutBodyHeight - actionStackMeasuredHeight - IDENTITY_FLOW_ACTIONS_MIN_GAP
    : 0;
  const pinnedActionScrollY =
    fitContentToScreen && shouldRenderInlineActionStack
      ? Math.max(
          0,
          contentLayoutY +
            contentHeight +
            actionFlowSpacerHeight -
            actionStackAnchorTop +
            theme.spacing.xs,
        )
      : 0;
  const requestedFlowVisualOffsetY =
    Platform.OS === 'web' && fitContentToScreen
      ? Math.max(0, pinnedActionScrollY - theme.spacing.xs)
      : 0;
  const flowVisualOffsetY = resolveIdentityFlowVisualOffset({
    identityY: identityLayoutY,
    requestedOffset: requestedFlowVisualOffsetY,
    topIdentityY,
  });
  const identityVisualTranslateY =
    flowVisualOffsetY > 0
      ? Animated.add(identityTranslateY, -flowVisualOffsetY)
      : identityTranslateY;

  const resetKeyboardTranslation = useCallback(() => {
    keyboardAdjustmentGenerationRef.current += 1;
    if (keyboardAdjustmentFrameRef.current !== null) {
      cancelAnimationFrame(keyboardAdjustmentFrameRef.current);
      keyboardAdjustmentFrameRef.current = null;
    }
    keyboardEventRef.current = null;
    keyboardFrameRef.current = null;
  }, []);

  const forceResetKeyboardTranslation = useCallback(() => {
    keyboardAdjustmentGenerationRef.current += 1;
    if (keyboardAdjustmentFrameRef.current !== null) {
      cancelAnimationFrame(keyboardAdjustmentFrameRef.current);
      keyboardAdjustmentFrameRef.current = null;
    }
    keyboardEventRef.current = null;
    keyboardFrameRef.current = null;
  }, []);

  const resetKeyboardRevealScroll = useCallback(
    ({ animated = true }: { readonly animated?: boolean } = {}) => {
      const baseScrollY = keyboardRevealBaseScrollYRef.current;
      const targetScrollY = keyboardRevealTargetScrollYRef.current;

      keyboardRevealBaseScrollYRef.current = null;
      keyboardRevealTargetScrollYRef.current = null;

      if (baseScrollY === null || targetScrollY === null) {
        return;
      }

      if (
        Math.abs(scrollYRef.current - targetScrollY) > IDENTITY_FLOW_KEYBOARD_SCROLL_RESET_THRESHOLD
      ) {
        return;
      }

      scrollYRef.current = baseScrollY;
      updateIdentityFlowScrollMetrics({ scrollY: baseScrollY, viewportHeight });
      activeScrollViewRef.current?.scrollTo({ animated, y: baseScrollY });
    },
    [activeScrollViewRef, viewportHeight],
  );

  const scrollFocusedInputIntoKeyboardView = useCallback(
    (event = keyboardEventRef.current) => {
      if (!shouldUseManualKeyboardLift) {
        return;
      }

      if (!event) {
        return;
      }

      const scrollView = activeScrollViewRef.current;
      const measurableScrollView = scrollView as MeasurableNativeNode | null;
      const focusedInput = getCurrentlyFocusedTextInput() as
        | MeasurableNativeNode
        | null
        | undefined;
      const measureScrollViewInWindow = measurableScrollView?.measureInWindow;
      const measureFocusedInputInWindow = focusedInput?.measureInWindow;

      if (!scrollView?.scrollTo || !measureScrollViewInWindow || !measureFocusedInputInWindow) {
        return;
      }

      const keyboardTop =
        keyboardFrameRef.current?.top ??
        Math.min(windowHeight, event.endCoordinates.screenY + keyboardVerticalOffset);

      if (keyboardTop >= windowHeight) {
        return;
      }

      measureFocusedInputInWindow.call(focusedInput, (_x, y, _width, height) => {
        if (keyboardEventRef.current !== event) {
          return;
        }

        measureScrollViewInWindow.call(
          measurableScrollView,
          (_scrollX, scrollY, _scrollWidth, scrollHeight) => {
            if (keyboardEventRef.current !== event) {
              return;
            }

            const focusedBottom = y + height;
            const visibleBottom = Math.min(keyboardTop, scrollY + scrollHeight, windowHeight);
            const overlap = focusedBottom + resolvedKeyboardActionClearance - visibleBottom;

            if (overlap <= 1) {
              return;
            }

            const currentScrollY = scrollYRef.current;
            const targetScrollY = Math.max(0, currentScrollY + overlap);

            if (keyboardRevealBaseScrollYRef.current === null) {
              keyboardRevealBaseScrollYRef.current = currentScrollY;
            }

            keyboardRevealTargetScrollYRef.current = targetScrollY;
            scrollYRef.current = targetScrollY;
            updateIdentityFlowScrollMetrics({
              scrollY: targetScrollY,
              viewportHeight,
            });
            scrollView.scrollTo({ animated: true, y: targetScrollY });
          },
        );
      });
    },
    [
      activeScrollViewRef,
      keyboardVerticalOffset,
      resolvedKeyboardActionClearance,
      shouldUseManualKeyboardLift,
      windowHeight,
    ],
  );

  const scheduleKeyboardAdjustment = useCallback(() => {
    const event = keyboardEventRef.current;

    if (!shouldUseManualKeyboardLift || !event) {
      return;
    }

    if (keyboardAdjustmentFrameRef.current !== null) {
      cancelAnimationFrame(keyboardAdjustmentFrameRef.current);
    }

    const adjustmentGeneration = keyboardAdjustmentGenerationRef.current;
    keyboardAdjustmentFrameRef.current = requestAnimationFrame(() => {
      keyboardAdjustmentFrameRef.current = null;
      if (
        keyboardAdjustmentGenerationRef.current === adjustmentGeneration &&
        keyboardEventRef.current === event
      ) {
        scrollFocusedInputIntoKeyboardView(event);
      }
    });
  }, [scrollFocusedInputIntoKeyboardView, shouldUseManualKeyboardLift]);

  const applyKeyboardFrame = useCallback(
    (event: KeyboardEvent) => {
      keyboardAdjustmentGenerationRef.current += 1;
      keyboardEventRef.current = event;

      const keyboardTop = Math.min(
        windowHeight,
        event.endCoordinates.screenY + keyboardVerticalOffset,
      );
      const keyboardHeight = Math.max(0, windowHeight - keyboardTop);
      keyboardFrameRef.current = keyboardHeight > 0 ? { top: keyboardTop } : null;

      if (keyboardHeight > 0) {
        scheduleKeyboardAdjustment();
      } else {
        resetKeyboardRevealScroll({ animated: true });
      }
    },
    [keyboardVerticalOffset, resetKeyboardRevealScroll, scheduleKeyboardAdjustment, windowHeight],
  );

  const resetKeyboardForHandoff = useCallback(
    () =>
      new Promise<void>((resolve) => {
        Keyboard.dismiss();
        keyboardAdjustmentGenerationRef.current += 1;
        if (keyboardAdjustmentFrameRef.current !== null) {
          cancelAnimationFrame(keyboardAdjustmentFrameRef.current);
          keyboardAdjustmentFrameRef.current = null;
        }
        keyboardEventRef.current = null;
        keyboardFrameRef.current = null;
        resetKeyboardRevealScroll({ animated: false });
        requestAnimationFrame(() => resolve());
      }),
    [resetKeyboardRevealScroll],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateIdentityFlowScrollMetrics({
        scrollY: event.nativeEvent.contentOffset.y,
        viewportHeight: windowHeight,
      });
      scrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
    },
    [viewportHeight],
  );

  const scrollIdentityFlowToEnd = useCallback(
    ({ animated = true }: { readonly animated?: boolean } = {}) => {
      const scrollView = activeScrollViewRef.current;

      if (!scrollView) {
        return;
      }

      scrollView.scrollToEnd({ animated });
    },
    [activeScrollViewRef],
  );

  useEffect(() => {
    lockedBodyHeightRef.current = 0;
    usedFallbackBodyHeightRef.current = false;
    setBodyHeight(0);
    setContentHeight(0);
    setHasMeasuredBody(false);
  }, [windowHeight, windowWidth]);

  useEffect(() => {
    if (hasMeasuredBody || viewportHeight <= 0) {
      return undefined;
    }

    const timer = setTimeout(() => {
      if (lockedBodyHeightRef.current > 0) {
        return;
      }

      const fallbackBodyHeight = Math.max(
        1,
        viewportHeight - Math.max(0, insets.top) - Math.max(0, insets.bottom),
      );
      usedFallbackBodyHeightRef.current = true;
      lockedBodyHeightRef.current = fallbackBodyHeight;
      setHasMeasuredBody(true);
      setBodyHeight(fallbackBodyHeight);
    }, 450);

    return () => clearTimeout(timer);
  }, [hasMeasuredBody, insets.bottom, insets.top, viewportHeight]);

  useEffect(() => {
    updateIdentityFlowScrollMetrics({ viewportHeight });
  }, [viewportHeight]);

  useEffect(() => {
    if (
      !scrollEnabled ||
      !contentTransitionKey ||
      (!fitContentToScreen && transitionScrollPolicy === 'preserve')
    ) {
      return;
    }

    let cancelled = false;

    requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      if (fitContentToScreen) {
        if (Platform.OS === 'web') {
          return;
        }

        let fittedScrollFrame = 0;
        const scrollToFittedEnd = () => {
          if (cancelled) {
            return;
          }

          const nextScrollY = Math.ceil(pinnedActionScrollY);
          if (nextScrollY > 1 && Math.abs(scrollYRef.current - nextScrollY) > 1) {
            scrollYRef.current = nextScrollY;
            updateIdentityFlowScrollMetrics({ scrollY: nextScrollY, viewportHeight });
            activeScrollViewRef.current?.scrollTo({ animated: true, y: nextScrollY });
          }

          scrollIdentityFlowToEnd({ animated: fittedScrollFrame === 0 });
          fittedScrollFrame += 1;

          if (fittedScrollFrame < IDENTITY_FLOW_FITTED_SCROLL_SETTLE_FRAMES) {
            requestAnimationFrame(scrollToFittedEnd);
          }
        };

        requestAnimationFrame(scrollToFittedEnd);
        return;
      }

      if (transitionScrollPolicy === 'reset-top') {
        scrollIdentityFlowToTop({ animated: false });
        return;
      }

      requestAnimationFrame(() => {
        if (!cancelled) {
          activeScrollViewRef.current?.scrollToEnd({ animated: true });
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeScrollViewRef,
    contentHeight,
    contentTransitionKey,
    fitContentToScreen,
    pinnedActionScrollY,
    scrollIdentityFlowToEnd,
    scrollEnabled,
    transitionScrollPolicy,
    viewportHeight,
  ]);

  useEffect(() => {
    if (Platform.OS === 'web' || !fitContentToScreen || !scrollEnabled || !contentTransitionKey) {
      return undefined;
    }

    let cancelled = false;
    const delays = [120];
    const timers = delays.map((delay, index) =>
      setTimeout(() => {
        if (!cancelled) {
          scrollIdentityFlowToEnd({ animated: index === 0 });
        }
      }, delay),
    );

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [
    contentHeight,
    contentTransitionKey,
    fitContentToScreen,
    scrollEnabled,
    scrollIdentityFlowToEnd,
  ]);

  useEffect(
    () => registerIdentityFlowScrollView(activeScrollViewRef, { viewportHeight }),
    [activeScrollViewRef, viewportHeight],
  );

  useEffect(
    () => registerIdentityFlowKeyboardResetForHandoff(resetKeyboardForHandoff),
    [resetKeyboardForHandoff],
  );

  useEffect(() => {
    if (!shouldUseManualKeyboardLift) {
      return undefined;
    }

    const frameEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const frameSubscription = Keyboard.addListener(frameEvent, applyKeyboardFrame);
    const didShowSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardEventRef.current = event;
      scheduleKeyboardAdjustment();
    });
    const hideSubscription = Keyboard.addListener('keyboardWillHide', resetKeyboardTranslation);
    const didHideSubscription =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardDidHide', () => {
            forceResetKeyboardTranslation();
            resetKeyboardRevealScroll({ animated: true });
          })
        : null;

    return () => {
      if (keyboardAdjustmentFrameRef.current !== null) {
        cancelAnimationFrame(keyboardAdjustmentFrameRef.current);
        keyboardAdjustmentFrameRef.current = null;
      }
      frameSubscription.remove();
      didShowSubscription.remove();
      hideSubscription.remove();
      didHideSubscription?.remove();
      keyboardEventRef.current = null;
      keyboardFrameRef.current = null;
      resetKeyboardRevealScroll({ animated: false });
    };
  }, [
    applyKeyboardFrame,
    forceResetKeyboardTranslation,
    resetKeyboardTranslation,
    resetKeyboardRevealScroll,
    scheduleKeyboardAdjustment,
    shouldUseManualKeyboardLift,
  ]);

  useEffect(() => {
    Animated.timing(identityMotion, {
      duration: IDENTITY_FLOW_STAGE_TRANSITION_MS,
      easing: BRAND_VERIFICATION_EASING,
      toValue: isCenterIdentity ? 0 : 1,
      useNativeDriver: true,
    }).start();
  }, [identityMotion, isCenterIdentity]);

  useLayoutEffect(() => {
    const previousSnapshot = activeContentSnapshotRef.current;
    const nextSnapshot = currentContentSnapshotRef.current;
    const contentKeyChanged = previousSnapshot.transitionKey !== nextSnapshot.transitionKey;

    activeContentSnapshotRef.current = nextSnapshot;

    if (!contentVisible) {
      contentSwapMotion.stopAnimation();
      setPreviousContentSnapshot(null);
      contentSwapMotion.setValue(1);
      return undefined;
    }

    if (!contentKeyChanged) {
      return undefined;
    }

    contentSwapMotion.stopAnimation();

    setPreviousContentSnapshot(previousSnapshot);
    contentSwapMotion.setValue(0);

    const animation = Animated.timing(contentSwapMotion, {
      duration: IDENTITY_FLOW_CONTENT_MORPH_MS,
      easing: BRAND_VERIFICATION_EASING,
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished) {
        setPreviousContentSnapshot(null);
      }
    });

    return () => {
      animation.stop();
    };
  }, [contentSwapMotion, contentTransitionKey, contentVisible]);

  useLayoutEffect(() => {
    if (activeContentSnapshotRef.current.transitionKey === contentTransitionKey) {
      activeContentSnapshotRef.current = currentContentSnapshotRef.current;
    }
  });

  useEffect(() => {
    const contentKeyChanged = previousContentTransitionKeyRef.current !== contentTransitionKey;
    previousContentTransitionKeyRef.current = contentTransitionKey;

    contentMotion.stopAnimation();
    if (!contentVisible && contentKeyChanged) {
      contentMotion.setValue(0);
      return;
    }

    Animated.timing(contentMotion, {
      duration: contentVisible ? IDENTITY_FLOW_CONTENT_ENTER_MS : IDENTITY_FLOW_CONTENT_EXIT_MS,
      easing: contentVisible ? BRAND_VERIFICATION_EASING : Easing.in(Easing.quad),
      toValue: contentVisible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [contentMotion, contentTransitionKey, contentVisible]);

  function renderTransitionContent(snapshot: IdentityFlowContentSnapshot) {
    return (
      <>
        {snapshot.shouldReserveMessageSlot ? (
          <View style={styles.messageSlot}>{snapshot.message}</View>
        ) : null}
        <View style={styles.contentSlot}>{snapshot.children}</View>
      </>
    );
  }

  function handleContentLayout(event: LayoutChangeEvent) {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setContentHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight,
    );
  }

  return (
    <IdentityFlowKeyboardAvoidanceContext.Provider value={scheduleKeyboardAdjustment}>
      <KeyboardAvoidingView
        behavior="padding"
        enabled={shouldUseManualKeyboardLift}
        keyboardVerticalOffset={keyboardVerticalOffset}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight <= 0) {
            return;
          }

          setMeasuredViewportHeight((currentHeight) =>
            Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight,
          );
        }}
        style={[styles.keyboardShell, { backgroundColor: screenBackgroundColor }]}
      >
        <ScreenShell
          contentContainerStyle={[
            styles.content,
            { paddingBottom: contentBottomPadding },
            contentStyle,
          ]}
          contentWidthStyle={[styles.contentWidth, contentWidthStyle]}
          headerVariant="plain"
          headerVisible={false}
          largeTitle={false}
          overlay={overlay}
          refresh={refresh}
          safeAreaEdges={safeAreaEdges}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          scrollEnabled={scrollEnabled}
          scrollViewRef={activeScrollViewRef}
          title={IDENTITY_FLOW_HEADER_TITLE}
          titleAlign="center"
        >
          <Animated.View style={styles.keyboardContent}>
            <View
              pointerEvents="none"
              style={[
                styles.screenTitle,
                {
                  opacity: layoutReady ? 1 : 0,
                  top: screenTitleTop,
                },
              ]}
            >
              <AppText style={styles.screenTitleText}>{IDENTITY_FLOW_HEADER_TITLE}</AppText>
            </View>
            <View
              onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                if (nextHeight <= 0) {
                  return;
                }

                if (lockedBodyHeightRef.current > 0 && !usedFallbackBodyHeightRef.current) {
                  return;
                }

                usedFallbackBodyHeightRef.current = false;
                lockedBodyHeightRef.current = nextHeight;
                setHasMeasuredBody(true);
                setBodyHeight(nextHeight);
              }}
              style={[styles.body, bodyStyle]}
            >
              {identity && layoutReady ? (
                <Animated.View
                  pointerEvents="box-none"
                  style={[
                    styles.identityMotionLayer,
                    {
                      opacity: layoutReady ? 1 : 0,
                      transform: [{ translateY: identityVisualTranslateY }],
                    },
                  ]}
                >
                  <View style={styles.identitySlot}>{identity}</View>
                </Animated.View>
              ) : null}
              <Animated.View
                style={[
                  styles.belowIdentity,
                  {
                    opacity: layoutReady ? 1 : 0,
                    paddingTop: Math.max(0, contentLayoutY - flowVisualOffsetY),
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.transitionedContent,
                    {
                      opacity: contentOpacity,
                      transform: [{ translateY: contentEnterTranslateY }],
                    },
                  ]}
                >
                  <View style={styles.transitionedContentFrame}>
                    <View style={styles.transitionedContentMeasure}>
                      {previousContentSnapshot ? (
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            styles.contentSwapLayer,
                            styles.contentSwapLayerOverlay,
                            previousContentSwapStyle,
                          ]}
                        >
                          {renderTransitionContent(previousContentSnapshot)}
                        </Animated.View>
                      ) : null}
                      <Animated.View
                        onLayout={handleContentLayout}
                        style={[styles.contentSwapLayer, currentContentSwapStyle]}
                      >
                        {renderTransitionContent(currentContentSnapshot)}
                      </Animated.View>
                    </View>
                    {shouldRenderInlineActionStack ? (
                      <View style={[styles.actionFlowSpacer, { height: actionFlowSpacerHeight }]} />
                    ) : null}
                    {shouldRenderInlineActionStack ? transitionedActionStack : null}
                  </View>
                </Animated.View>
              </Animated.View>
            </View>
          </Animated.View>
        </ScreenShell>
      </KeyboardAvoidingView>
    </IdentityFlowKeyboardAvoidanceContext.Provider>
  );
}

export function IdentityFlowIdentity({
  avatarLabel,
  avatarUrl,
  centerFaceSize = 'large',
  children,
  disabled,
  editable = false,
  onPress,
  state = 'idle',
  targetKind,
  variant = 'brand',
}: {
  readonly avatarLabel?: string;
  readonly avatarUrl?: string | null;
  readonly centerFaceSize?: IdentityFlowCenterFaceSize;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly editable?: boolean;
  readonly onPress?: () => void;
  readonly state?: BrandVerificationState;
  readonly targetKind?: 'avatar' | 'mark';
  readonly variant?: 'avatar' | 'brand' | 'remembered' | 'status';
}) {
  const activeTheme = useAppTheme();
  const resolvedTargetKind = targetKind ?? (variant === 'avatar' ? 'avatar' : 'mark');
  const resolvedTargetVisualKind =
    variant === 'avatar' || variant === 'remembered' ? 'identityAvatar' : 'identityMark';
  const resolvedCenterGlyphSize =
    centerFaceSize === 'small' ? IDENTITY_FLOW_COMPACT_FACE_SIZE : undefined;
  const resolvedCenterGlyphViewBox =
    centerFaceSize === 'small' ? undefined : IDENTITY_FLOW_LARGE_FACE_VIEW_BOX;
  const outerRotationDegrees =
    variant === 'avatar' && editable ? IDENTITY_FLOW_AVATAR_OUTER_ROTATION_DEGREES : 0;
  const avatarEditPencilIsDark = activeTheme.scheme === 'dark';
  const avatarEditPencilAccentColor = activeTheme.colors.primary;
  const avatarEditPencilBackgroundColor = avatarEditPencilIsDark
    ? activeTheme.colors.white
    : avatarEditPencilAccentColor;
  const avatarEditPencilIconColor = avatarEditPencilIsDark
    ? avatarEditPencilAccentColor
    : activeTheme.colors.white;
  const identity =
    variant === 'avatar' ? (
      <BrandVerificationMark
        center={
          <View style={styles.avatarWrap}>
            <AppAvatar
              imageUrl={avatarUrl ?? null}
              label={avatarLabel ?? 'Tu perfil'}
              size={IDENTITY_FLOW_PROFILE_AVATAR_SIZE}
            />
          </View>
        }
        centerSize={IDENTITY_FLOW_PROFILE_AVATAR_SIZE}
        outerRotationDegrees={outerRotationDegrees}
        replaceCenterOnResult={false}
        showOuterInIdle
        size={IDENTITY_FLOW_STAGE_SIZE}
        state={state}
      />
    ) : variant === 'remembered' ? (
      <BrandVerificationMark
        center={
          <AppAvatar
            fallbackBackgroundColor={theme.colors.warning}
            fallbackTextColor={theme.colors.white}
            imageUrl={avatarUrl ?? null}
            label={avatarLabel ?? 'Tu perfil'}
            size={88}
          />
        }
        centerSize={88}
        showOuterInIdle
        size={IDENTITY_FLOW_STAGE_SIZE}
        state={state}
      />
    ) : (
      <BrandVerificationMark
        centerGlyphSize={resolvedCenterGlyphSize}
        centerGlyphViewBox={resolvedCenterGlyphViewBox}
        showOuterInIdle
        size={IDENTITY_FLOW_STAGE_SIZE}
        state={state}
      />
    );

  const content = (
    <View style={styles.identityStage}>
      {identity}
      {variant === 'avatar' && editable ? (
        <View
          pointerEvents="none"
          style={[
            styles.avatarEditPencil,
            {
              backgroundColor: avatarEditPencilBackgroundColor,
              borderColor: avatarEditPencilBackgroundColor,
            },
          ]}
        >
          <Ionicons color={avatarEditPencilIconColor} name="pencil" size={15} />
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <LaunchIntroTargetView
      avatarEditable={variant === 'avatar' && editable}
      avatarFallbackBackgroundColor={
        variant === 'remembered' && resolvedTargetVisualKind === 'identityAvatar'
          ? theme.colors.warning
          : undefined
      }
      avatarFallbackTextColor={
        variant === 'remembered' && resolvedTargetVisualKind === 'identityAvatar'
          ? theme.colors.white
          : undefined
      }
      avatarLabel={
        resolvedTargetVisualKind === 'identityAvatar' ? (avatarLabel ?? 'Tu perfil') : undefined
      }
      avatarSize={
        resolvedTargetVisualKind === 'identityAvatar'
          ? variant === 'remembered'
            ? 88
            : IDENTITY_FLOW_PROFILE_AVATAR_SIZE
          : undefined
      }
      avatarUrl={resolvedTargetVisualKind === 'identityAvatar' ? (avatarUrl ?? null) : undefined}
      centerFaceSize={resolvedTargetVisualKind === 'identityMark' ? centerFaceSize : undefined}
      kind={resolvedTargetKind}
      outerRotationDegrees={outerRotationDegrees}
      priority={20}
      stageSize={IDENTITY_FLOW_STAGE_SIZE}
      style={styles.identityTarget}
      visualState={state}
      visualKind={resolvedTargetVisualKind}
    >
      {onPress ? (
        <Pressable
          disabled={disabled}
          onPress={disabled ? undefined : onPress}
          style={({ pressed }) => [pressed && !disabled ? styles.pressed : null]}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </LaunchIntroTargetView>
  );
}

export function IdentityFlowStatusCopy({
  subtitle,
  title,
}: {
  readonly subtitle: string;
  readonly title: string;
}) {
  return (
    <View style={styles.statusCopy}>
      <AppText style={styles.statusTitle}>{title}</AppText>
      <AppText style={styles.statusSubtitle}>{subtitle}</AppText>
    </View>
  );
}

export function IdentityFlowLogoCopy({
  subtitle,
  title,
}: {
  readonly subtitle?: string;
  readonly title: string;
}) {
  return (
    <View style={styles.logoCopy}>
      <AppText adjustsFontSizeToFit minimumFontScale={0.86} style={styles.logoCopyTitle}>
        {title}
      </AppText>
      {subtitle ? <AppText style={styles.logoCopySubtitle}>{subtitle}</AppText> : null}
    </View>
  );
}

export function IdentityFlowForm({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.form, style]}>{children}</View>;
}

export function IdentityFlowField({
  children,
  error,
  icon,
  label,
  reserveError = true,
  showLabel = false,
  status = error ? 'danger' : 'idle',
  style,
}: {
  readonly children: ReactNode;
  readonly error?: string | null;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly reserveError?: boolean;
  readonly showLabel?: boolean;
  readonly status?: IdentityFlowFieldStatus;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const activeTheme = useAppTheme();
  const visual = resolveFieldVisual(status, activeTheme);

  return (
    <View style={[styles.fieldBlock, style]}>
      {showLabel ? (
        <AppText style={[styles.fieldLabel, error ? styles.fieldLabelError : null]}>
          {label}
        </AppText>
      ) : null}
      <View accessibilityLabel={label} style={styles.fieldRow}>
        <View style={[styles.fieldIcon, { backgroundColor: visual.backgroundColor }]}>
          <Ionicons color={visual.color} name={icon} size={18} />
        </View>
        <View style={styles.fieldControl}>
          <View
            style={[
              styles.fieldPanel,
              {
                backgroundColor: visual.panelColor,
                borderColor: visual.borderColor,
              },
            ]}
          >
            {children}
          </View>
          {reserveError ? (
            <AppText style={[styles.fieldError, !error ? styles.fieldErrorHidden : null]}>
              {error ?? ' '}
            </AppText>
          ) : error ? (
            <AppText style={styles.fieldError}>{error}</AppText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export const IdentityFlowTextInput = forwardRef<AppTextInputRef, AppTextInputProps>(
  function IdentityFlowTextInput(
    { chrome = 'plain', density = 'identity', onFocus, ...props },
    ref,
  ) {
    const scheduleKeyboardAdjustment = useContext(IdentityFlowKeyboardAvoidanceContext);

    return (
      <AppTextInput
        {...props}
        chrome={chrome}
        density={density}
        onFocus={(event) => {
          onFocus?.(event);
          scheduleKeyboardAdjustment?.();
        }}
        ref={ref}
      />
    );
  },
);

export const IdentityFlowPasswordInput = forwardRef<AppTextInputRef, PasswordTextInputProps>(
  function IdentityFlowPasswordInput(
    { chrome = 'plain', density = 'identity', onFocus, ...props },
    ref,
  ) {
    const scheduleKeyboardAdjustment = useContext(IdentityFlowKeyboardAvoidanceContext);

    return (
      <PasswordTextInput
        {...props}
        chrome={chrome}
        density={density}
        onFocus={(event) => {
          onFocus?.(event);
          scheduleKeyboardAdjustment?.();
        }}
        ref={ref}
      />
    );
  },
);

export function IdentityFlowMessageSlot({
  children,
  minHeight = IDENTITY_FLOW_MESSAGE_SLOT_HEIGHT,
  style,
}: {
  readonly children?: ReactNode;
  readonly minHeight?: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.messageSlot, { minHeight }, style]}>{children}</View>;
}

export function IdentityFlowPrimaryAction({
  disabled,
  href,
  icon,
  label,
  loading,
  onPress,
  style,
}: {
  readonly disabled?: boolean;
  readonly href?: Href;
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly loading?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  function handlePress() {
    if (!onPress) {
      return;
    }

    Keyboard.dismiss();
    setTimeout(onPress, IDENTITY_FLOW_ACTION_AFTER_KEYBOARD_DISMISS_MS);
  }

  return (
    <PrimaryAction
      disabled={disabled}
      href={href}
      icon={icon}
      label={label}
      loading={loading}
      onPress={onPress ? handlePress : undefined}
      style={[styles.primaryAction, style]}
    />
  );
}

export function IdentityFlowSecondaryAction({
  disabled,
  icon = 'person-circle-outline',
  label,
  onPress,
  style,
}: {
  readonly disabled?: boolean;
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const activeTheme = useAppTheme();
  const actionContentMotion = useRef(new Animated.Value(1)).current;
  const actionContentRef = useRef({ icon, label });
  const [renderedActionContent, setRenderedActionContent] = useState(actionContentRef.current);
  const [previousActionContent, setPreviousActionContent] = useState<{
    readonly icon: keyof typeof Ionicons.glyphMap;
    readonly label: string;
  } | null>(null);

  useEffect(() => {
    const previousContent = actionContentRef.current;

    if (previousContent.icon === icon && previousContent.label === label) {
      return undefined;
    }

    const nextContent = { icon, label };
    actionContentRef.current = nextContent;
    setPreviousActionContent(previousContent);
    setRenderedActionContent(nextContent);
    actionContentMotion.stopAnimation();
    actionContentMotion.setValue(0);

    const animation = Animated.timing(actionContentMotion, {
      duration: IDENTITY_FLOW_CONTENT_ENTER_MS,
      easing: BRAND_VERIFICATION_EASING,
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished) {
        setPreviousActionContent(null);
      }
    });

    return () => {
      animation.stop();
    };
  }, [actionContentMotion, icon, label]);

  const currentActionContentStyle = {
    opacity: actionContentMotion,
    transform: [
      {
        translateY: actionContentMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [4, 0],
        }),
      },
    ],
  };
  const previousActionContentStyle = {
    opacity: actionContentMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        translateY: actionContentMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  };

  function handlePress() {
    if (!onPress) {
      return;
    }

    Keyboard.dismiss();
    setTimeout(onPress, IDENTITY_FLOW_ACTION_AFTER_KEYBOARD_DISMISS_MS);
  }

  function renderActionContent(
    content: { readonly icon: keyof typeof Ionicons.glyphMap; readonly label: string },
    animatedStyle: StyleProp<ViewStyle>,
    overlay = false,
  ) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.secondaryActionContent,
          overlay ? styles.secondaryActionContentOverlay : null,
          animatedStyle,
        ]}
      >
        <Ionicons color={activeTheme.colors.textMuted} name={content.icon} size={18} />
        <AppText style={[styles.secondaryActionText, { color: activeTheme.colors.textMuted }]}>
          {content.label}
        </AppText>
      </Animated.View>
    );
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={disabled ? undefined : handlePress}
      style={({ pressed }) => [
        styles.secondaryAction,
        {
          backgroundColor:
            activeTheme.scheme === 'dark'
              ? activeTheme.colors.surfaceSoft
              : activeTheme.colors.surface,
          borderColor: activeTheme.colors.border,
        },
        style,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.secondaryActionContentFrame}>
        {previousActionContent
          ? renderActionContent(previousActionContent, previousActionContentStyle, true)
          : null}
        {renderActionContent(renderedActionContent, currentActionContentStyle)}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  keyboardContent: {
    flex: 1,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  contentWidth: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: IDENTITY_FLOW_CONTENT_MAX_WIDTH,
    width: '100%',
  },
  body: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    position: 'relative',
    width: '100%',
  },
  identitySlot: {
    alignItems: 'center',
    width: '100%',
  },
  identityMotionLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
    zIndex: 4,
  },
  belowIdentity: {
    flexGrow: 1,
    width: '100%',
  },
  transitionedContent: {
    flexGrow: 1,
    width: '100%',
  },
  transitionedContentFrame: {
    width: '100%',
  },
  transitionedContentMeasure: {
    gap: theme.spacing.sm,
    position: 'relative',
    width: '100%',
  },
  contentSwapLayer: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  contentSwapLayerOverlay: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  transitionedActionStack: {
    width: '100%',
  },
  actionFlowSpacer: {
    width: '100%',
  },
  contentSlot: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  actionStack: {
    alignSelf: 'center',
    gap: theme.spacing.sm,
    maxWidth: IDENTITY_FLOW_CONTENT_MAX_WIDTH,
    width: '100%',
  },
  screenTitle: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: theme.spacing.xxs,
    zIndex: 2,
  },
  screenTitleText: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: 'center',
  },
  identityTarget: {
    alignSelf: 'center',
  },
  identityStage: {
    alignItems: 'center',
    alignSelf: 'center',
    height: IDENTITY_FLOW_STAGE_SIZE,
    justifyContent: 'center',
    width: IDENTITY_FLOW_STAGE_SIZE,
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEditPencil: {
    alignItems: 'center',
    borderRadius: IDENTITY_FLOW_AVATAR_EDIT_PENCIL_SIZE / 2,
    borderWidth: 1,
    bottom: IDENTITY_FLOW_AVATAR_EDIT_PENCIL_OFFSET,
    height: IDENTITY_FLOW_AVATAR_EDIT_PENCIL_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    right: IDENTITY_FLOW_AVATAR_EDIT_PENCIL_OFFSET,
    width: IDENTITY_FLOW_AVATAR_EDIT_PENCIL_SIZE,
  },
  statusCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 70,
    width: '100%',
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
  },
  statusSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  logoCopy: {
    alignItems: 'center',
    gap: theme.spacing.xxs,
    justifyContent: 'center',
    minHeight: IDENTITY_FLOW_MESSAGE_SLOT_HEIGHT,
    width: '100%',
  },
  logoCopyTitle: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
  },
  logoCopySubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
  form: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  fieldBlock: {
    gap: theme.spacing.xs,
    width: '100%',
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  fieldLabelError: {
    color: theme.colors.danger,
  },
  fieldRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  fieldIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: IDENTITY_FLOW_FIELD_ICON_SIZE,
    justifyContent: 'center',
    marginTop: 8,
    width: IDENTITY_FLOW_FIELD_ICON_SIZE,
  },
  fieldControl: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  fieldPanel: {
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    minHeight: IDENTITY_FLOW_FIELD_HEIGHT,
    overflow: 'visible',
  },
  fieldError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
    minHeight: IDENTITY_FLOW_FIELD_ERROR_HEIGHT,
    paddingHorizontal: theme.spacing.xs,
  },
  fieldErrorHidden: {
    opacity: 0,
  },
  messageSlot: {
    justifyContent: 'center',
    minHeight: IDENTITY_FLOW_MESSAGE_SLOT_HEIGHT,
    width: '100%',
  },
  primaryAction: {
    borderRadius: theme.radius.medium,
  },
  secondaryAction: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 196,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  secondaryActionContentFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
    minWidth: 150,
    position: 'relative',
  },
  secondaryActionContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  secondaryActionContentOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  secondaryActionText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.58,
  },
});
