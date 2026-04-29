import { forwardRef, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextInput, TextStyle, ViewStyle } from 'react-native';

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
export const IDENTITY_FLOW_PROFILE_AVATAR_SIZE = 118;
export const IDENTITY_FLOW_FIELD_HEIGHT = 56;
export const IDENTITY_FLOW_FIELD_ICON_SIZE = 40;
export const IDENTITY_FLOW_HEADER_TITLE = 'Happy Circles';

export type IdentityFlowFieldStatus = 'danger' | 'idle' | 'success';

function resolveFieldVisual(status: IdentityFlowFieldStatus) {
  if (status === 'success') {
    return {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.border,
      color: theme.colors.success,
      panelColor: 'rgba(61, 186, 110, 0.08)',
    };
  }

  if (status === 'danger') {
    return {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
      color: theme.colors.danger,
      panelColor: 'rgba(232, 96, 74, 0.08)',
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
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly contentWidthStyle?: StyleProp<ViewStyle>;
  readonly identity?: ReactNode;
  readonly keyboardVerticalOffset?: number;
}

export function IdentityFlowScreen({
  actions,
  bodyStyle,
  children,
  contentStyle,
  contentWidthStyle,
  footer,
  identity,
  keyboardVerticalOffset = Platform.OS === 'ios' ? 24 : 0,
  overlay,
  refresh,
  scrollEnabled = false,
  scrollViewRef,
}: IdentityFlowScreenProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.keyboardShell}
    >
      <ScreenShell
        contentContainerStyle={[styles.content, contentStyle]}
        contentWidthStyle={[styles.contentWidth, contentWidthStyle]}
        footer={footer}
        headerVariant="plain"
        largeTitle={false}
        overlay={overlay}
        refresh={refresh}
        scrollEnabled={scrollEnabled}
        scrollViewRef={scrollViewRef}
        title={IDENTITY_FLOW_HEADER_TITLE}
        titleAlign="center"
      >
        <View style={[styles.body, bodyStyle]}>
          {identity}
          {children}
          {actions}
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}

export function IdentityFlowIdentity({
  avatarLabel,
  avatarUrl,
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
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly editable?: boolean;
  readonly onPress?: () => void;
  readonly state?: BrandVerificationState;
  readonly targetKind?: 'avatar' | 'mark';
  readonly variant?: 'avatar' | 'brand' | 'remembered' | 'status';
}) {
  const resolvedTargetKind = targetKind ?? (variant === 'avatar' ? 'avatar' : 'mark');
  const identity =
    variant === 'avatar' ? (
      <View style={styles.avatarWrap}>
        <AppAvatar
          imageUrl={avatarUrl ?? null}
          label={avatarLabel ?? 'Tu perfil'}
          size={IDENTITY_FLOW_PROFILE_AVATAR_SIZE}
        />
        {editable ? (
          <View style={styles.avatarEditBadge}>
            <Ionicons color={theme.colors.white} name="pencil" size={18} />
          </View>
        ) : null}
      </View>
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
      <BrandVerificationMark showOuterInIdle size={IDENTITY_FLOW_STAGE_SIZE} state={state} />
    );

  const content = (
    <View style={styles.identityStage}>
      {identity}
      {children}
    </View>
  );

  return (
    <LaunchIntroTargetView kind={resolvedTargetKind} priority={20} style={styles.identityTarget}>
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
  status = error ? 'danger' : 'idle',
  style,
}: {
  readonly children: ReactNode;
  readonly error?: string | null;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly reserveError?: boolean;
  readonly status?: IdentityFlowFieldStatus;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const visual = resolveFieldVisual(status);

  return (
    <View style={[styles.fieldBlock, style]}>
      <Text style={[styles.fieldLabel, error ? styles.fieldLabelError : null]}>{label}</Text>
      <View style={styles.fieldRow}>
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
  minHeight = 48,
  style,
}: {
  readonly children?: ReactNode;
  readonly minHeight?: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.messageSlot, { minHeight }, style]}>{children}</View>;
}

export function IdentityFlowActions({
  anchored = true,
  disabled,
  loading,
  onPrimaryPress,
  onSecondaryPress,
  primaryHref,
  primaryIcon,
  primaryLabel,
  secondaryDisabled,
  secondaryIcon = 'person-circle-outline',
  secondaryLabel,
}: {
  readonly anchored?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onPrimaryPress?: () => void;
  readonly onSecondaryPress?: () => void;
  readonly primaryHref?: Href;
  readonly primaryIcon?: keyof typeof Ionicons.glyphMap;
  readonly primaryLabel: string;
  readonly secondaryDisabled?: boolean;
  readonly secondaryIcon?: keyof typeof Ionicons.glyphMap;
  readonly secondaryLabel?: string;
}) {
  return (
    <View style={[styles.actions, !anchored ? styles.actionsInline : null]}>
      <PrimaryAction
        disabled={disabled}
        href={primaryHref}
        icon={primaryIcon}
        label={primaryLabel}
        loading={loading}
        onPress={onPrimaryPress}
        style={styles.primaryAction}
      />
      {secondaryLabel ? (
        <IdentityFlowSecondaryAction
          disabled={secondaryDisabled}
          icon={secondaryIcon}
          label={secondaryLabel}
          onPress={onSecondaryPress}
        />
      ) : null}
    </View>
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
  return (
    <Pressable
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
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
    gap: theme.spacing.lg,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.lg,
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
  avatarEditBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    bottom: 2,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: 38,
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
  form: {
    gap: theme.spacing.md,
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
    minHeight: 16,
    paddingHorizontal: theme.spacing.xs,
  },
  fieldErrorHidden: {
    opacity: 0,
  },
  messageSlot: {
    justifyContent: 'center',
    width: '100%',
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: 'auto',
    paddingTop: theme.spacing.md,
    width: '100%',
  },
  actionsInline: {
    marginTop: 0,
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
