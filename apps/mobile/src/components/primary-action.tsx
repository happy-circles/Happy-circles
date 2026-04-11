import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export interface PrimaryActionProps {
  readonly label: string;
  readonly subtitle?: string;
  readonly onPress?: () => void;
  readonly href?: string;
  readonly variant?: 'primary' | 'secondary' | 'ghost';
  readonly compact?: boolean;
}

export function PrimaryAction({
  label,
  subtitle,
  onPress,
  href,
  variant = 'primary',
  compact = false,
}: PrimaryActionProps) {
  const content = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.baseCompact : null,
        variant === 'primary' ? styles.primary : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'ghost' ? styles.ghost : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.copy}>
        <Text
          style={[
            styles.label,
            compact ? styles.labelCompact : null,
            variant === 'primary' ? styles.primaryText : null,
            variant !== 'primary' ? styles.secondaryText : null,
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
      {variant !== 'ghost' ? (
        <Ionicons
          color={variant === 'primary' ? theme.colors.white : theme.colors.text}
          name="arrow-forward"
          size={compact ? 16 : 18}
        />
      ) : null}
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href as Href} asChild>
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
  copy: {
    flex: 1,
    gap: 2,
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
