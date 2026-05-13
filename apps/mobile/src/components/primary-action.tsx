import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

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
  const activeTheme = useAppTheme();
  const isDisabled = loading || disabled;
  const foregroundColor =
    variant === 'primary' ? activeTheme.colors.onPrimary : (color ?? activeTheme.colors.text);
  const content = (
    <Pressable
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.baseCompact : null,
        variant === 'primary' ? themedPrimaryStyle(activeTheme, color) : null,
        variant === 'secondary' ? themedSecondaryStyle(activeTheme) : null,
        variant === 'ghost' ? themedGhostStyle(activeTheme) : null,
        fullWidth ? styles.fullWidth : null,
        style,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={[styles.copy, fullWidth ? styles.copyFullWidth : null]}>
        <AppText
          style={[
            styles.label,
            compact ? styles.labelCompact : null,
            { color: foregroundColor },
            variant !== 'primary' && color ? { color } : null,
          ]}
        >
          {label}
        </AppText>
        {subtitle ? (
          <AppText
            style={[
              styles.subtitle,
              compact ? styles.subtitleCompact : null,
              variant === 'primary'
                ? { color: activeTheme.colors.whiteAlphaStrong }
                : { color: activeTheme.colors.textMuted },
            ]}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {loading ? (
        <HappyCirclesMotion
          color={foregroundColor}
          size={compact ? 30 : 36}
          tone="mono"
          variant="loading"
        />
      ) : icon || variant !== 'ghost' ? (
        <Ionicons
          color={foregroundColor}
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
    borderWidth: 1,
  },
  secondary: {
    borderWidth: 1,
  },
  ghost: {},
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
});

function themedPrimaryStyle(activeTheme: ReturnType<typeof useAppTheme>, color?: string) {
  const backgroundColor = color ?? activeTheme.colors.primary;

  return {
    backgroundColor,
    borderColor: color ?? activeTheme.colors.primaryStrong,
    ...activeTheme.shadow.card,
  };
}

function themedSecondaryStyle(activeTheme: ReturnType<typeof useAppTheme>) {
  return {
    backgroundColor: activeTheme.colors.surface,
    borderColor: activeTheme.colors.border,
  };
}

function themedGhostStyle(activeTheme: ReturnType<typeof useAppTheme>) {
  return {
    backgroundColor: activeTheme.colors.surfaceMuted,
  };
}
