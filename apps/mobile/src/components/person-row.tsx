import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { PersonCardDto } from '@happy-circles/application';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';

import { StatusChip } from './status-chip';

export interface PersonRowProps {
  readonly person: PersonCardDto;
}

export function PersonRow({ person }: PersonRowProps) {
  const amountTone = person.direction === 'owes_me' ? styles.positive : styles.negative;
  const amountLabel = person.direction === 'owes_me' ? 'Te deben' : 'Debes';

  return (
    <Link href={`/person/${person.userId}` as Href} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
        <View style={styles.leading}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{person.displayName.slice(0, 1)}</Text>
          </View>
          <View style={styles.textWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.name}>{person.displayName}</Text>
              {person.pendingCount > 0 ? (
                <StatusChip
                  label={`${person.pendingCount}`}
                  tone="warning"
                />
              ) : null}
            </View>
            <Text style={styles.meta}>{person.lastActivityLabel}</Text>
          </View>
        </View>
        <View style={styles.trailing}>
          <Text style={styles.amountLabel}>{amountLabel}</Text>
          <Text style={[styles.amount, amountTone]}>{formatCop(person.netAmountMinor)}</Text>
          <Ionicons color={theme.colors.muted} name="chevron-forward" size={18} />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
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
  avatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  textWrap: {
    flex: 1,
    gap: 2,
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
    color: theme.colors.muted,
    fontSize: theme.typography.footnote,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 2,
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
});
