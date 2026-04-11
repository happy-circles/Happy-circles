import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import type { PersonCardDto } from '@happy-circles/application';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

import { AppAvatar } from './app-avatar';
import { StatusChip } from './status-chip';
import { SurfaceCard } from './surface-card';

export interface PersonRowProps {
  readonly person: PersonCardDto;
}

function buildLastUpdateLabel(value: string): string {
  if (value.trim().length === 0) {
    return 'Reciente';
  }

  const relativeMatch = value.match(/(hace .+|hoy|ayer)$/i);
  if (relativeMatch) {
    return relativeMatch[1]!;
  }

  if (value.toLocaleLowerCase('es-CO') === 'sin movimientos todavia') {
    return 'Sin movimientos';
  }

  return value;
}

export function PersonRow({ person }: PersonRowProps) {
  const isSettled = person.direction === 'settled' || person.netAmountMinor === 0;
  const amountTone = isSettled ? styles.neutral : person.direction === 'owes_me' ? styles.positive : styles.negative;
  const amountLabel = isSettled ? 'Sin saldo' : person.direction === 'owes_me' ? 'Te deben' : 'Debes';
  const lastUpdateLabel = buildLastUpdateLabel(person.lastActivityLabel);

  return (
    <Link href={`/person/${person.userId}` as Href} asChild>
      <Pressable style={({ pressed }) => [pressed ? styles.pressed : null]}>
        <SurfaceCard
          padding="md"
          style={[
            styles.card,
            person.direction === 'owes_me' ? styles.cardPositive : null,
            person.direction === 'i_owe' ? styles.cardNegative : null,
          ]}
          variant="default"
        >
          <View style={styles.leading}>
            <AppAvatar imageUrl={person.avatarUrl ?? null} label={person.displayName} rounded={false} size={42} />
            <View style={styles.textWrap}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{person.displayName}</Text>
                {person.pendingCount > 0 ? (
                  <StatusChip
                    label={`${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''}`}
                    tone="warning"
                  />
                ) : null}
              </View>
              <Text style={styles.meta}>{lastUpdateLabel}</Text>
            </View>
          </View>
          <View style={styles.trailing}>
            <Text style={styles.amountLabel}>{amountLabel}</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amount, amountTone]}>{formatCop(person.netAmountMinor)}</Text>
              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
            </View>
          </View>
        </SurfaceCard>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  cardPositive: {
    borderLeftColor: theme.colors.success,
  },
  cardNegative: {
    borderLeftColor: theme.colors.warning,
  },
  pressed: {
    opacity: 0.92,
  },
  leading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  amountLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '600',
  },
  amount: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
  neutral: {
    color: theme.colors.text,
  },
});
