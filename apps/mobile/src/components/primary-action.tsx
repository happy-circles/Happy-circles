import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';

export interface PrimaryActionProps {
  readonly label: string;
  readonly subtitle?: string;
  readonly onPress?: () => void;
  readonly href?: Href;
  readonly variant?: 'primary' | 'secondary' | 'ghost';
  readonly compact?: boolean;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly color?: string;
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly style?: StyleProp<ViewStyle>;
}

export function PrimaryAction({
  label,
  subtitle,
  onPress,
  href,
  variant = 'primary',
  compact = false,
  loading = false,
  disabled = false,
  fullWidth = true,
  color,
  icon,
  style,
}: PrimaryActionProps) {
  const isDisabled = loading || disabled;
  const content = (
    <Pressable
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.baseCompact : null,
        variant === 'primary' ? styles.primary : null,
        variant === 'primary' && color ? { backgroundColor: color, borderColor: color } : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'ghost' ? styles.ghost : null,
        fullWidth ? styles.fullWidth : null,
        style,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={[styles.copy, fullWidth ? styles.copyFullWidth : null]}>
        <Text
          style={[
            styles.label,
            compact ? styles.labelCompact : null,
            variant === 'primary' ? styles.primaryText : null,
            variant !== 'primary' ? styles.secondaryText : null,
            variant !== 'primary' && color ? { color } : null,
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              compact ? styles.subtitleCompact : null,
              variant === 'primary' ? styles.primarySubtext : null,
              variant !== 'primary' ? styles.secondarySubtext : null,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <HappyCirclesMotion
          color={variant === 'primary' ? theme.colors.white : color ?? theme.colors.text}
          size={compact ? 30 : 36}
          tone="mono"
          variant="loading"
        />
      ) : icon || variant !== 'ghost' ? (
        <Ionicons
          color={variant === 'primary' ? theme.colors.white : color ?? theme.colors.text}
          name={icon ?? 'arrow-forward'}
          size={compact ? 16 : 18}
        />
      ) : null}
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        {content}
      </Link>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  baseCompact: {
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryStrong,
    borderWidth: 1,
    ...theme.shadow.card,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.58,
  },
  copy: {
    gap: 2,
  },
  copyFullWidth: {
    flex: 1,
  },
  label: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  labelCompact: {
    fontSize: theme.typography.callout,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  subtitleCompact: {
    lineHeight: 14,
  },
  primaryText: {
    color: theme.colors.white,
  },
  secondaryText: {
    color: theme.colors.text,
  },
  primarySubtext: {
    color: 'rgba(255, 255, 255, 0.82)',
  },
  secondarySubtext: {
    color: theme.colors.textMuted,
  },
});
