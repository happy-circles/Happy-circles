import { Link, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { styles } from './profile-screen-runtime.styles';

interface ProfileSetupReminderSectionProps {
  readonly completeProfileHref: Href;
  readonly inlineButtonTextThemeStyle: {
    readonly color: string;
  };
  readonly inlineButtonThemeStyle: {
    readonly backgroundColor: string;
    readonly borderColor: string;
  };
}

export function ProfileSetupReminderSection({
  completeProfileHref,
  inlineButtonTextThemeStyle,
  inlineButtonThemeStyle,
}: ProfileSetupReminderSectionProps) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <AppText style={styles.sectionTitle}>Setup pendiente</AppText>
      </View>
      <Link href={completeProfileHref} asChild>
        <Pressable
          style={({ pressed }) => [
            styles.inlineButton,
            inlineButtonThemeStyle,
            pressed ? styles.rowPressed : null,
          ]}
        >
          <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
            Completar configuración
          </AppText>
        </Pressable>
      </Link>
    </View>
  );
}
