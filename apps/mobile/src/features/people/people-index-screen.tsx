import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTextInput } from '@/components/app-text-input';
import { EmptyState } from '@/components/empty-state';
import { PersonRow } from '@/components/person-row';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';

export function PeopleIndexScreen() {
  const snapshotQuery = useAppSnapshot();
  const people = snapshotQuery.data?.dashboard.activePeople ?? [];
  const [personQuery, setPersonQuery] = useState('');
  const normalizedQuery = personQuery.trim().toLocaleLowerCase('es-CO');
  const filteredPeople = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return people;
    }

    return people.filter((person) =>
      person.displayName.toLocaleLowerCase('es-CO').includes(normalizedQuery),
    );
  }, [people, normalizedQuery]);

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Personas">
        <Text style={styles.supportText}>Estamos cargando tu red real.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Personas">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerSlot={
        <Link href="/invite" asChild>
          <Pressable style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}>
            <Ionicons color={theme.colors.text} name="person-add-outline" size={18} />
          </Pressable>
        </Link>
      }
      headerVariant="plain"
      largeTitle={false}
      title="Personas"
    >
      {people.length > 0 ? (
        <AppTextInput
          autoCapitalize="words"
          clearButtonMode="while-editing"
          onChangeText={setPersonQuery}
          placeholder="Buscar persona"
          placeholderTextColor={theme.colors.muted}
          style={styles.searchInput}
          value={personQuery}
        />
      ) : null}

      {people.length === 0 ? (
        <View style={styles.onboardingStack}>
          <EmptyState
            description={noActiveRelationshipsEmptyState.description}
            title={noActiveRelationshipsEmptyState.title}
          />
          <PrimaryAction
            href="/invite"
            label={noActiveRelationshipsEmptyState.actionLabel}
            subtitle={noActiveRelationshipsEmptyState.actionSubtitle}
          />
        </View>
      ) : filteredPeople.length === 0 ? (
        <EmptyState
          description="Prueba con otro nombre o borra la busqueda para ver toda tu red."
          title="No encontramos a esa persona"
        />
      ) : (
        <View style={styles.list}>
          {filteredPeople.map((person) => (
            <PersonRow key={person.userId} person={person} />
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
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
  searchInput: {
    borderRadius: theme.radius.large,
    minHeight: 44,
    paddingVertical: theme.spacing.xs,
  },
  onboardingStack: {
    gap: theme.spacing.sm,
  },
  list: {
    gap: theme.spacing.sm,
  },
});
