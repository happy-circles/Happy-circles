import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text-input';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { PersonRow } from '@/components/person-row';
import { ScreenShell } from '@/components/screen-shell';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import { InviteRequestsSheet } from '@/features/home/dashboard-invite-requests-sheet';
import {
  parseInviteRequestsTabParam,
  usePeopleInviteRequestsController,
} from '@/features/people/use-people-invite-requests-controller';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { AppText } from '@/components/app-text';

function inviteRequestsSummary(receivedCount: number, sentCount: number): string {
  if (receivedCount > 0) {
    return receivedCount === 1
      ? '1 solicitud por revisar'
      : `${receivedCount} solicitudes por revisar`;
  }

  return sentCount === 1 ? '1 solicitud enviada' : `${sentCount} solicitudes enviadas`;
}

function PeopleInviteRequestsEntry({
  receivedCount,
  sentCount,
  onPress,
}: {
  readonly receivedCount: number;
  readonly sentCount: number;
  readonly onPress: () => void;
}) {
  const totalCount = receivedCount + sentCount;

  if (totalCount === 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={`Solicitudes. ${inviteRequestsSummary(receivedCount, sentCount)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.requestsEntry, pressed ? styles.pressed : null]}
    >
      <View style={styles.requestsEntryIcon}>
        <Ionicons color={theme.colors.primary} name="person-add-outline" size={19} />
      </View>
      <View style={styles.requestsEntryCopy}>
        <AppText numberOfLines={1} style={styles.requestsEntryTitle}>
          Solicitudes
        </AppText>
        <AppText numberOfLines={1} style={styles.requestsEntryDetail}>
          {inviteRequestsSummary(receivedCount, sentCount)}
        </AppText>
      </View>
      <View style={styles.requestsEntryCta}>
        <AppText numberOfLines={1} style={styles.requestsEntryCtaText}>
          Revisar
        </AppText>
        <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}

export function PeopleIndexScreen() {
  const params = useLocalSearchParams<{
    addPerson?: string;
    amountMinor?: string;
    description?: string;
    direction?: string;
    requests?: string;
    requestTab?: string;
  }>();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const people = snapshotQuery.data?.dashboard.activePeople ?? [];
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const inviteRequests = usePeopleInviteRequestsController({
    accountInviteHistoryItems: snapshotQuery.data?.accountInviteHistoryItems ?? [],
    accountInvitePendingItems: snapshotQuery.data?.accountInvitePendingItems ?? [],
    friendshipHistoryItems: snapshotQuery.data?.friendshipHistoryItems ?? [],
    friendshipPendingItems: snapshotQuery.data?.friendshipPendingItems ?? [],
  });
  const openInviteRequests = inviteRequests.open;
  const preferredInviteTab = inviteRequests.preferredTab;
  const [personQuery, setPersonQuery] = useState('');
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
  const handledRequestParamRef = useRef<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<{
    readonly imageUrl: string | null;
    readonly label: string;
  } | null>(null);
  const normalizedQuery = personQuery.trim().toLocaleLowerCase('es-CO');
  const filteredPeople = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return people;
    }

    return people.filter((person) =>
      person.displayName.toLocaleLowerCase('es-CO').includes(normalizedQuery),
    );
  }, [people, normalizedQuery]);
  const transactionContext = useMemo(() => {
    const amountMinor =
      typeof params.amountMinor === 'string' ? Number.parseInt(params.amountMinor, 10) : Number.NaN;
    const direction: 'i_owe' | 'owes_me' | null =
      params.direction === 'i_owe' ? 'i_owe' : params.direction === 'owes_me' ? 'owes_me' : null;

    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || !direction) {
      return null;
    }

    return {
      amountMinor,
      description: typeof params.description === 'string' ? params.description : null,
      direction,
    };
  }, [params.amountMinor, params.description, params.direction]);

  useEffect(() => {
    if (params.addPerson === '1') {
      setAddPersonSheetVisible(true);
    }
  }, [params.addPerson]);

  useEffect(() => {
    if (params.requests !== '1') {
      return;
    }

    const requestKey = `${params.requests}:${params.requestTab ?? ''}`;
    if (handledRequestParamRef.current === requestKey) {
      return;
    }

    handledRequestParamRef.current = requestKey;
    openInviteRequests(parseInviteRequestsTabParam(params.requestTab) ?? preferredInviteTab);
  }, [openInviteRequests, params.requestTab, params.requests, preferredInviteTab]);

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Personas">
        <View style={styles.loadingMotion}>
          <HappyCirclesMotion size={108} variant="loading" />
        </View>
        <AppText style={styles.supportText}>Estamos cargando tu red real.</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Personas">
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerSlot={
        <Pressable
          onPress={() => setAddPersonSheetVisible(true)}
          style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={theme.colors.text} name="person-add-outline" size={18} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      title="Personas"
    >
      {people.length > 0 ? (
        <View style={styles.searchWrap}>
          <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
          <AppTextInput
            autoCapitalize="words"
            clearButtonMode="while-editing"
            chrome="plain"
            density="compact"
            onChangeText={setPersonQuery}
            placeholder="Buscar persona"
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
            value={personQuery}
          />
        </View>
      ) : null}

      <PeopleInviteRequestsEntry
        onPress={() => openInviteRequests()}
        receivedCount={inviteRequests.receivedItems.length}
        sentCount={inviteRequests.sentItems.length}
      />

      {people.length === 0 ? (
        <EmptyState
          description={noActiveRelationshipsEmptyState.description}
          title={noActiveRelationshipsEmptyState.title}
        />
      ) : filteredPeople.length === 0 ? (
        <EmptyState
          description="Prueba con otro nombre o borra la busqueda para ver toda tu red."
          title="No encontramos a esa persona"
        />
      ) : (
        <View style={styles.list}>
          {filteredPeople.map((person) => (
            <PersonRow
              key={person.userId}
              onAvatarPress={(selectedPerson) =>
                setAvatarPreview({
                  imageUrl: selectedPerson.avatarUrl ?? null,
                  label: selectedPerson.displayName,
                })
              }
              person={person}
            />
          ))}
        </View>
      )}
      <AvatarViewerModal
        imageUrl={avatarPreview?.imageUrl ?? null}
        label={avatarPreview?.label ?? 'Persona'}
        onClose={() => setAvatarPreview(null)}
        visible={avatarPreview !== null}
      />
      <AddPersonContactsSheet
        currentUserAvatarUrl={currentUserProfile?.avatarUrl ?? null}
        currentUserLabel={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
        onClose={() => setAddPersonSheetVisible(false)}
        transactionContext={transactionContext}
        visible={addPersonSheetVisible}
      />
      <InviteRequestsSheet
        activeTab={inviteRequests.activeTab}
        busyKey={inviteRequests.busyKey}
        historyItems={inviteRequests.historyItems}
        message={inviteRequests.message}
        onAction={(item, action) => void inviteRequests.handleAction(item, action)}
        onChangeTab={inviteRequests.setActiveTab}
        onClose={inviteRequests.close}
        receivedItems={inviteRequests.receivedItems}
        sentItems={inviteRequests.sentItems}
        visible={inviteRequests.visible}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  loadingMotion: {
    alignItems: 'center',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.62,
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 52,
    paddingHorizontal: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
  },
  list: {
    gap: theme.spacing.sm,
  },
  requestsEntry: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 62,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  requestsEntryIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  requestsEntryCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  requestsEntryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 18,
  },
  requestsEntryDetail: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  requestsEntryCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  requestsEntryCtaText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
});
