import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MoneyHero } from '@/components/money-hero';
import { PersonRow } from '@/components/person-row';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export function DashboardScreen() {
  const snapshotQuery = useAppSnapshot();
  const dashboard = snapshotQuery.data?.dashboard;

  if (snapshotQuery.isLoading || !dashboard) {
    return (
      <ScreenShell title="Inicio" subtitle="Cargando balance y personas.">
        <Text style={styles.supportText}>Estamos sincronizando tu estado real con Supabase.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell title="Inicio" subtitle="No pudimos cargar tu resumen.">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerSlot={
        <Link href="/activity" asChild>
          <Pressable style={styles.bellButton}>
            <Ionicons color={theme.colors.text} name="notifications-outline" size={22} />
            {dashboard.urgentCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{dashboard.urgentCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
      }
      title="Inicio"
      subtitle="Balance y personas en un solo lugar."
    >
      <MoneyHero
        amountMinor={dashboard.summary.netBalanceMinor}
        caption="Lo importante al abrir la app."
        label="Balance"
        secondaryMetrics={[
          {
            label: 'Debes',
            amountMinor: dashboard.summary.totalIOweMinor,
            tone: 'negative',
          },
          {
            label: 'Te deben',
            amountMinor: dashboard.summary.totalOwedToMeMinor,
            tone: 'positive',
          },
        ]}
        tone={
          dashboard.summary.netBalanceMinor === 0
            ? 'neutral'
            : dashboard.summary.netBalanceMinor > 0
              ? 'positive'
              : 'negative'
        }
      />

      {dashboard.topPendingPreview ? (
        <View style={styles.pendingStrip}>
          <View style={styles.pendingText}>
            <Text style={styles.pendingTitle}>{dashboard.topPendingPreview.title}</Text>
            <Text style={styles.pendingSubtitle}>
              {typeof dashboard.topPendingPreview.amountMinor === 'number'
                ? `${formatCop(dashboard.topPendingPreview.amountMinor)} | `
                : null}
              {dashboard.topPendingPreview.subtitle}
            </Text>
          </View>
          <PrimaryAction href={dashboard.topPendingPreview.href} label="Ver" variant="ghost" />
        </View>
      ) : null}

      <SectionBlock title="Personas" subtitle="Toca una persona para ver su estado real y su historial.">
        {dashboard.activePeople.length === 0 ? (
          <EmptyState
            title="Todavia no hay relaciones activas"
            description="Cuando tengas relaciones activas y movimientos confirmados, apareceran aqui."
          />
        ) : (
          dashboard.activePeople.map((person) => <PersonRow key={person.userId} person={person} />)
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    position: 'relative',
    width: 40,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
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
  pendingStrip: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  pendingText: {
    flex: 1,
    gap: 3,
  },
  pendingTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  pendingSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
});
