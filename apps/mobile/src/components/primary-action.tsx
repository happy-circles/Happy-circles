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
}

export function PrimaryAction({
  label,
  subtitle,
  onPress,
  href,
  variant = 'primary',
}: PrimaryActionProps) {
  const content = (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'ghost' ? styles.ghost : null,
        pressed ? styles.pressed : null,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.label,
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
            variant === 'primary' ? styles.primarySubtext : null,
            variant !== 'primary' ? styles.secondarySubtext : null,
          ]}
        >
          {subtitle}
        </Text>
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
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: theme.colors.primarySoft,
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: theme.typography.caption,
    textAlign: 'center',
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
