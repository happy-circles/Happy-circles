import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

import { PrimaryAction } from './primary-action';
import { SurfaceCard } from './surface-card';
import { AppText } from '@/components/app-text';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly actionHref?: Href;
}

export function EmptyState({ title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <SurfaceCard style={styles.card} variant="muted" padding="lg">
      <AppText style={styles.kicker}>Sin contenido</AppText>
      <AppText style={styles.title}>{title}</AppText>
      <AppText style={styles.description}>{description}</AppText>
      {actionLabel && actionHref ? (
        <View style={styles.actionSlot}>
          <PrimaryAction label={actionLabel} href={actionHref} />
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
  },
  actionSlot: {
    width: '100%',
  },
  kicker: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    alignSelf: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
});
