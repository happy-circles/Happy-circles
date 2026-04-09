import { StyleSheet, Text } from 'react-native';

import { theme } from '@/lib/theme';

import { PrimaryAction } from './primary-action';
import { SurfaceCard } from './surface-card';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export function EmptyState({ title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <SurfaceCard style={styles.card} variant="muted" padding="lg">
      <Text style={styles.kicker}>Sin contenido</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && actionHref ? <PrimaryAction label={actionLabel} href={actionHref} /> : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  kicker: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
});
