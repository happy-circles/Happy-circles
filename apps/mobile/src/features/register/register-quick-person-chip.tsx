import { Pressable } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';
import type { RegisterPerson } from './register-flow-helpers';
import { styles } from './register-flow-screen-styles';

export function QuickPersonChip({
  person,
  onPress,
}: {
  readonly person: RegisterPerson;
  readonly onPress: (personId: string) => void;
}) {
  const activeTheme = useAppTheme();

  return (
    <Pressable
      onPress={() => onPress(person.userId)}
      style={({ pressed }) => [
        styles.quickPersonChip,
        { backgroundColor: activeTheme.colors.surface, borderColor: activeTheme.colors.border },
        pressed ? styles.quickPersonChipPressed : null,
      ]}
    >
      <AppAvatar imageUrl={person.avatarUrl ?? null} label={person.displayName} size={30} />
      <AppText numberOfLines={1} style={styles.quickPersonLabel}>
        {person.displayName}
      </AppText>
    </Pressable>
  );
}
