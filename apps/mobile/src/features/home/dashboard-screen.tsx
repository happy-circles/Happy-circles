import { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PersonRow } from '@/components/person-row';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export function DashboardScreen() {
  const snapshotQuery = useAppSnapshot();
  const dashboard = snapshotQuery.data?.dashboard;
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
  const attentionCount = activePeople.filter((person) => person.pendingCount > 0).length;
  const peopleSubtitle =
    attentionCount > 0
      ? `${attentionCount} persona${attentionCount > 1 ? 's' : ''} requieren atencion.`
      : 'Saldos y movimientos.';

  if (snapshotQuery.isLoading || !dashboard) {
    return (
      <ScreenShell headerVariant="plain" title="Happy Circles">
        <Text style={styles.supportText}>Estamos sincronizando el panorama general de tu cuenta.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" title="Happy Circles">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
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
    >
      <SurfaceCard padding="lg" style={styles.balanceCard} variant="elevated">
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
        <Text style={styles.balanceCaption}>Pulso general de lo que debes y de lo que te deben.</Text>
        <View style={styles.balanceMetaRow}>
          <SurfaceCard padding="md" style={styles.balanceMetaCard} variant="muted">
            <Text style={styles.balanceMetaLabel}>Debes</Text>
            <Text style={[styles.balanceMetaValue, styles.balanceNegative]}>
              {formatCop(dashboard.summary.totalIOweMinor)}
            </Text>
          </SurfaceCard>
          <SurfaceCard padding="md" style={styles.balanceMetaCard} variant="muted">
            <Text style={styles.balanceMetaLabel}>Te deben</Text>
            <Text style={[styles.balanceMetaValue, styles.balancePositive]}>
              {formatCop(dashboard.summary.totalOwedToMeMinor)}
            </Text>
          </SurfaceCard>
        </View>
      </SurfaceCard>

      <SectionBlock
        action={
          <Link href="/invite" asChild>
            <Pressable style={({ pressed }) => [styles.peopleAction, pressed ? styles.quickActionPressed : null]}>
              <Ionicons color={theme.colors.textMuted} name="person-add-outline" size={18} />
            </Pressable>
          </Link>
        }
        subtitle={peopleSubtitle}
        title="Personas"
      >
        {dashboard.activePeople.length > 0 ? (
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
          <EmptyState
            actionHref="/invite"
            actionLabel="Enviar invitacion"
            description="Cuando tengas relaciones activas y movimientos confirmados, apareceran aqui."
            title="Todavia no hay relaciones activas"
          />
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
  balanceCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  balanceLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
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
  balanceCaption: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  balanceMetaRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  balanceMetaCard: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.xxs,
  },
  balanceMetaLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  balanceMetaValue: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    textAlign: 'center',
  },
  quickActionPressed: {
    opacity: 0.6,
  },
  balancePositive: {
    color: theme.colors.success,
  },
  balanceNegative: {
    color: theme.colors.warning,
  },
  peopleAction: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
});
