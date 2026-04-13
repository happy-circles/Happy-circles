import { useMemo, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { AppAvatar } from '@/components/app-avatar';
import { PersonRow } from '@/components/person-row';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { formatCop } from '@/lib/data';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export function DashboardScreen() {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const dashboard = snapshotQuery.data?.dashboard;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const [personQuery, setPersonQuery] = useState('');
  const normalizedQuery = personQuery.trim().toLocaleLowerCase('es-CO');
  const activePeople = dashboard?.activePeople ?? [];
  const filteredPeople = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return activePeople;
    }

    return activePeople.filter((person) =>
      person.displayName.toLocaleLowerCase('es-CO').includes(normalizedQuery),
    );
  }, [activePeople, normalizedQuery]);

  if (snapshotQuery.isLoading || !dashboard) {
    return (
      <ScreenShell headerVariant="plain" title="Happy Circles" titleAlign="center">
        <Text style={styles.supportText}>Estamos sincronizando el panorama general de tu cuenta.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" title="Happy Circles" titleAlign="center">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerLeading={
        <Link href="/profile" asChild>
          <Pressable style={({ pressed }) => [styles.profileButton, pressed ? styles.quickActionPressed : null]}>
            <AppAvatar
              imageUrl={currentUserProfile?.avatarUrl ?? null}
              label={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
              size={34}
            />
          </Pressable>
        </Link>
      }
      headerSlot={
        <Link href="/activity" asChild>
          <Pressable style={styles.bellButton}>
            <Ionicons color={theme.colors.text} name="notifications-outline" size={20} />
            {dashboard.urgentCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{dashboard.urgentCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
      }
      headerVariant="plain"
      title="Happy Circles"
      titleAlign="center"
    >
      <View style={styles.balanceHero}>
        <Text style={styles.balanceLabel}>Balance actual</Text>
        <Text
          style={[
            styles.balanceAmount,
            dashboard.summary.netBalanceMinor > 0 ? styles.balancePositive : null,
            dashboard.summary.netBalanceMinor < 0 ? styles.balanceNegative : null,
          ]}
        >
          {formatCop(dashboard.summary.netBalanceMinor)}
        </Text>
        <View style={styles.balanceMetaRow}>
          <Text style={[styles.balanceMetaText, styles.balanceNegative]}>
            Debes {formatCop(dashboard.summary.totalIOweMinor)}
          </Text>
          <View style={styles.balanceMetaDivider} />
          <Text style={[styles.balanceMetaText, styles.balancePositive]}>
            Te deben {formatCop(dashboard.summary.totalOwedToMeMinor)}
          </Text>
        </View>
      </View>

      <SectionBlock
        action={
          <Link href="/invite" asChild>
            <Pressable style={({ pressed }) => [styles.peopleAction, pressed ? styles.quickActionPressed : null]}>
              <Ionicons color={theme.colors.primary} name="person-add-outline" size={18} />
            </Pressable>
          </Link>
        }
        title="Personas"
      >
        {dashboard.activePeople.length > 4 ? (
          <TextInput
            autoCapitalize="words"
            clearButtonMode="while-editing"
            onChangeText={setPersonQuery}
            placeholder="Buscar persona"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            value={personQuery}
          />
        ) : null}
        {dashboard.activePeople.length === 0 ? (
          <View style={styles.onboardingStack}>
            <EmptyState
              description={noActiveRelationshipsEmptyState.description}
              title={noActiveRelationshipsEmptyState.title}
            />
            <PrimaryAction
              label={noActiveRelationshipsEmptyState.actionLabel}
              onPress={() => router.push('/invite')}
              subtitle={noActiveRelationshipsEmptyState.actionSubtitle}
            />
          </View>
        ) : filteredPeople.length === 0 ? (
          <EmptyState
            description="Prueba con otro nombre o borra la busqueda para ver toda tu red."
            title="No encontramos a esa persona"
          />
        ) : (
          filteredPeople.map((person) => <PersonRow key={person.userId} person={person} />)
        )}
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  profileButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  bellButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.tiny,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  balanceHero: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  balanceLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  balanceAmount: {
    color: theme.colors.text,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 46,
    textAlign: 'center',
  },
  balanceMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    paddingTop: theme.spacing.xs,
  },
  balanceMetaText: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  balanceMetaDivider: {
    backgroundColor: theme.colors.hairline,
    height: 12,
    width: 1,
  },
  quickActionPressed: {
    opacity: 0.6,
  },
  onboardingStack: {
    gap: theme.spacing.sm,
  },
  balancePositive: {
    color: theme.colors.success,
  },
  balanceNegative: {
    color: theme.colors.warning,
  },
  peopleAction: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
});
