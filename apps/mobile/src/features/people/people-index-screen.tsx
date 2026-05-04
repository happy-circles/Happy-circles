import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { PersonRow } from '@/components/person-row';
import { ScreenShell } from '@/components/screen-shell';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';

export function PeopleIndexScreen() {
  const params = useLocalSearchParams<{
    addPerson?: string;
    amountMinor?: string;
    description?: string;
    direction?: string;
  }>();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const people = snapshotQuery.data?.dashboard.activePeople ?? [];
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const [personQuery, setPersonQuery] = useState('');
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
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

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Personas">
        <View style={styles.loadingMotion}>
          <HappyCirclesMotion size={108} variant="loading" />
        </View>
        <Text style={styles.supportText}>Estamos cargando tu red real.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Personas">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
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
          <TextInput
            autoCapitalize="words"
            clearButtonMode="while-editing"
            cursorColor={theme.colors.primary}
            onChangeText={setPersonQuery}
            placeholder="Buscar persona"
            placeholderTextColor={theme.colors.muted}
            selectionColor={theme.colors.primary}
            style={styles.searchInput}
            value={personQuery}
          />
        </View>
      ) : null}

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
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.body,
    lineHeight: 20,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  list: {
    gap: theme.spacing.sm,
  },
});
