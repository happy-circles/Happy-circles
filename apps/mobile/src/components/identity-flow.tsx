import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import type {
  KeyboardEvent,
  StyleProp,
  TextInput,
  TextStyle,
  ViewStyle,
} from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput, type AppTextInputProps } from '@/components/app-text-input';
import {
  BrandVerificationMark,
  type BrandVerificationState,
} from '@/components/brand-verification-lockup';
import { LaunchIntroTargetView } from '@/components/launch-intro-presence';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell, type ScreenShellProps } from '@/components/screen-shell';
import { theme } from '@/lib/theme';

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
const IDENTITY_FLOW_FOOTER_ACTIONS_MIN_HEIGHT = 56;
export const IDENTITY_FLOW_LARGE_FACE_VIEW_BOX = '222 222 236 236';
const IDENTITY_FLOW_MESSAGE_SLOT_HEIGHT = 72;
const IDENTITY_FLOW_TOP_OFFSET = theme.spacing.xxs * 2 + 28 + theme.spacing.lg;
const IDENTITY_FLOW_STAGE_TRANSITION_MS = 520;

export type IdentityFlowFieldStatus = 'danger' | 'idle' | 'success' | 'warning';
export type IdentityFlowCenterFaceSize = 'large' | 'small';
export type IdentityFlowCenterLayout = 'balanced' | 'compact';
export type IdentityFlowIdentityPosition = 'auto' | 'center' | 'top';

function resolveFieldVisual(status: IdentityFlowFieldStatus) {
  if (status === 'success') {
    return {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.border,
      color: theme.colors.success,
      panelColor: 'rgba(61, 186, 110, 0.08)',
    };
  }

  if (status === 'danger' || status === 'warning') {
    const color = status === 'warning' ? theme.colors.warning : theme.colors.danger;
    const panelColor =
      status === 'warning' ? 'rgba(249, 115, 22, 0.08)' : 'rgba(232, 96, 74, 0.08)';

    return {
      backgroundColor: status === 'warning' ? theme.colors.warningSoft : theme.colors.dangerSoft,
      borderColor: color,
      color,
      panelColor,
    };
  }

  return {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
    color: theme.colors.primary,
    panelColor: theme.colors.primaryGhost,
  };
}

interface IdentityFlowScreenProps extends Pick<
  ScreenShellProps,
  'footer' | 'overlay' | 'refresh' | 'scrollEnabled' | 'scrollViewRef'
> {
  readonly actions?: ReactNode;
  readonly bodyStyle?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
  readonly contentTransitionKey?: string;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly contentVisible?: boolean;
  readonly contentWidthStyle?: StyleProp<ViewStyle>;
  readonly identity?: ReactNode;
  readonly identityCenterLayout?: IdentityFlowCenterLayout;
  readonly identityPosition?: IdentityFlowIdentityPosition;
  readonly keyboardVerticalOffset?: number;
  readonly message?: ReactNode;
}

export function IdentityFlowScreen({
  actions,
  bodyStyle,
  children,
  contentTransitionKey,
  contentStyle,
  contentVisible = true,
  contentWidthStyle,
  footer,
  identity,
  identityCenterLayout = 'balanced',
  identityPosition = 'auto',
  keyboardVerticalOffset = Platform.OS === 'ios' ? 24 : 0,
  message,
  overlay,
  refresh,
  scrollEnabled = false,
  scrollViewRef,
}: IdentityFlowScreenProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const keyboardTranslateY = useRef(new Animated.Value(0)).current;
  const resolvedFooter =
    footer ?? (actions ? <View style={styles.footerActions}>{actions}</View> : undefined);
  const resolvedIdentityPosition =
    identityPosition === 'auto' ? (scrollEnabled ? 'top' : 'center') : identityPosition;
  const isCenterIdentity = resolvedIdentityPosition === 'center';
  const shouldReserveMessageSlot = message !== undefined || resolvedIdentityPosition === 'center';
  const identityMotion = useRef(new Animated.Value(isCenterIdentity ? 0 : 1)).current;
  const contentMotion = useRef(new Animated.Value(contentVisible ? 1 : 0)).current;
  const lockedBodyHeightRef = useRef(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [hasMeasuredBody, setHasMeasuredBody] = useState(false);
  const layoutReady = hasMeasuredBody && bodyHeight > 0;
  const topIdentityY = IDENTITY_FLOW_TOP_OFFSET;
  const centerRestRatio = identityCenterLayout === 'compact' ? 0.32 : 0.44;
  const preferredCenterIdentityY = bodyHeight / 2 - IDENTITY_FLOW_STAGE_SIZE / 2;
  const readableCenterIdentityY = bodyHeight * centerRestRatio - IDENTITY_FLOW_STAGE_SIZE / 2;
  const centerIdentityY = layoutReady
    ? Math.max(topIdentityY, Math.min(preferredCenterIdentityY, readableCenterIdentityY))
    : topIdentityY;
  const topContentY = topIdentityY + IDENTITY_FLOW_STAGE_SIZE + theme.spacing.sm;
  const centerContentY = centerIdentityY + IDENTITY_FLOW_STAGE_SIZE + theme.spacing.sm;
  const identityTranslateY = identityMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [centerIdentityY, topIdentityY],
  });
  const contentTranslateY = identityMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [centerContentY - topContentY, 0],
  });
  const contentEnterTranslateY = contentMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0],
  });
  const transitionedFooter = resolvedFooter ? (
    <Animated.View
      style={[
        styles.transitionedFooter,
        { opacity: contentMotion, transform: [{ translateY: contentEnterTranslateY }] },
      ]}
    >
      {resolvedFooter}
    </Animated.View>
  ) : undefined;

  useEffect(() => {
    lockedBodyHeightRef.current = 0;
    setBodyHeight(0);
    setHasMeasuredBody(false);
  }, [windowHeight, windowWidth]);

  useEffect(() => {
    function animateKeyboard(toValue: number, event?: KeyboardEvent) {
      Animated.timing(keyboardTranslateY, {
        duration: Math.max(event?.duration ?? 180, 120),
        easing: Easing.out(Easing.cubic),
        toValue,
        useNativeDriver: true,
      }).start();
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const keyboardHeight = Math.max(0, event.endCoordinates.height - keyboardVerticalOffset);
      animateKeyboard(-keyboardHeight, event);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      animateKeyboard(0, event);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardTranslateY, keyboardVerticalOffset]);

  useEffect(() => {
    Animated.timing(identityMotion, {
      duration: IDENTITY_FLOW_STAGE_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: isCenterIdentity ? 0 : 1,
      useNativeDriver: true,
    }).start();
  }, [identityMotion, isCenterIdentity]);

  useEffect(() => {
    contentMotion.stopAnimation();
    Animated.timing(contentMotion, {
      duration: contentVisible ? 280 : 160,
      easing: contentVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      toValue: contentVisible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [contentMotion, contentTransitionKey, contentVisible]);

  return (
    <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
      <Animated.View
        style={[styles.keyboardShell, { transform: [{ translateY: keyboardTranslateY }] }]}
      >
        <ScreenShell
          contentContainerStyle={[styles.content, contentStyle]}
          contentWidthStyle={[styles.contentWidth, contentWidthStyle]}
          footer={transitionedFooter}
          footerDivider={false}
          headerVariant="plain"
          headerVisible={false}
          largeTitle={false}
          overlay={overlay}
          refresh={refresh}
          scrollEnabled={scrollEnabled}
          scrollViewRef={scrollViewRef}
          title={IDENTITY_FLOW_HEADER_TITLE}
          titleAlign="center"
        >
          <View
            pointerEvents="none"
            style={[styles.screenTitle, { opacity: layoutReady ? 1 : 0 }]}
          >
            <Text style={styles.screenTitleText}>{IDENTITY_FLOW_HEADER_TITLE}</Text>
          </View>
          <View
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;
              if (nextHeight <= 0) {
                return;
              }

              if (lockedBodyHeightRef.current > 0) {
                return;
              }

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
                    transform: [{ translateY: identityTranslateY }],
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
                  paddingTop: topContentY,
                  transform: [{ translateY: contentTranslateY }],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.transitionedContent,
                  {
                    opacity: contentMotion,
                    transform: [{ translateY: contentEnterTranslateY }],
                  },
                ]}
              >
                {shouldReserveMessageSlot ? <View style={styles.messageSlot}>{message}</View> : null}
                <View style={styles.contentSlot}>{children}</View>
              </Animated.View>
            </Animated.View>
          </View>
        </ScreenShell>
      </Animated.View>
    </TouchableWithoutFeedback>
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
  const resolvedTargetKind = targetKind ?? (variant === 'avatar' ? 'avatar' : 'mark');
  const resolvedTargetVisualKind =
    variant === 'avatar' || variant === 'remembered' ? 'identityAvatar' : 'identityMark';
  const resolvedCenterGlyphSize =
    centerFaceSize === 'small' ? IDENTITY_FLOW_COMPACT_FACE_SIZE : undefined;
  const resolvedCenterGlyphViewBox =
    centerFaceSize === 'small' ? undefined : IDENTITY_FLOW_LARGE_FACE_VIEW_BOX;
  const outerRotationDegrees =
    variant === 'avatar' && editable ? IDENTITY_FLOW_AVATAR_OUTER_ROTATION_DEGREES : 0;
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
            fallbackBackgroundColor="#ff5b0a"
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
        <View pointerEvents="none" style={styles.avatarEditPencil}>
          <Ionicons color={theme.colors.white} name="pencil" size={15} />
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
          ? '#ff5b0a'
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
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusSubtitle}>{subtitle}</Text>
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
      <Text adjustsFontSizeToFit minimumFontScale={0.86} style={styles.logoCopyTitle}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.logoCopySubtitle}>{subtitle}</Text> : null}
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
  const visual = resolveFieldVisual(status);

  return (
    <View style={[styles.fieldBlock, style]}>
      {showLabel ? (
        <Text style={[styles.fieldLabel, error ? styles.fieldLabelError : null]}>{label}</Text>
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
            <Text style={[styles.fieldError, !error ? styles.fieldErrorHidden : null]}>
              {error ?? ' '}
            </Text>
          ) : error ? (
            <Text style={styles.fieldError}>{error}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export const IdentityFlowTextInput = forwardRef<
  TextInput,
  AppTextInputProps & { readonly style?: StyleProp<TextStyle> }
>(function IdentityFlowTextInput({ style, ...props }, ref) {
  return <AppTextInput {...props} ref={ref} style={[styles.textInput, style]} />;
});

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
  function handlePress() {
    if (!onPress) {
      return;
    }

    Keyboard.dismiss();
    setTimeout(onPress, IDENTITY_FLOW_ACTION_AFTER_KEYBOARD_DISMISS_MS);
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={disabled ? undefined : handlePress}
      style={({ pressed }) => [
        styles.secondaryAction,
        style,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Ionicons color={theme.colors.textMuted} name={icon} size={18} />
      <Text style={styles.secondaryActionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    backgroundColor: theme.colors.background,
    flex: 1,
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
    width: '100%',
  },
  transitionedContent: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  transitionedFooter: {
    width: '100%',
  },
  contentSlot: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  footerActions: {
    gap: theme.spacing.sm,
    minHeight: IDENTITY_FLOW_FOOTER_ACTIONS_MIN_HEIGHT,
    paddingBottom: theme.spacing.xs,
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
    letterSpacing: -0.5,
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
  textInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: IDENTITY_FLOW_FIELD_HEIGHT,
    minHeight: IDENTITY_FLOW_FIELD_HEIGHT,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
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
