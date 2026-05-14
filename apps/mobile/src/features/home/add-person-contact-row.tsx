import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import {
  actionMetaForResolution,
  contactAvatarColor,
  contactMeta,
  shouldShowInApp,
} from '@/features/home/contacts-sheet-helpers';
import { type ContactCandidate } from '@/features/invites/people-outreach-utils';
import { type PeopleTargetResolution } from '@/lib/live-data';
import { useAppTheme } from '@/providers/theme-provider';

export function ContactRow({
  busy,
  contact,
  onPress,
  resolution,
}: {
  readonly busy: boolean;
  readonly contact: ContactCandidate;
  readonly onPress: () => void;
  readonly resolution: PeopleTargetResolution | null;
}) {
  const activeTheme = useAppTheme();
  const hasMultiplePhones = contact.phoneOptions.length > 1;
  const action = actionMetaForResolution(resolution, hasMultiplePhones);
  const disabled = action.disabled || busy;
  const actionBackgroundColor =
    action.tone === 'invite'
      ? activeTheme.colors.warning
      : action.tone === 'muted'
        ? activeTheme.colors.muted
        : activeTheme.colors.primary;

  return (
    <View
      style={[
        styles.contactRow,
        { backgroundColor: activeTheme.colors.surfaceMuted },
        shouldShowInApp(resolution)
          ? {
              backgroundColor: activeTheme.colors.successSoft,
              borderColor: activeTheme.colors.successSoft,
              borderWidth: 1,
            }
          : null,
      ]}
    >
      <AppAvatar
        fallbackBackgroundColor={contactAvatarColor(contact, activeTheme)}
        fallbackTextColor={activeTheme.colors.white}
        label={contact.alias}
        size={44}
      />
      <View style={styles.contactCopy}>
        <AppText numberOfLines={1} style={styles.contactName}>
          {contact.alias}
        </AppText>
        <AppText numberOfLines={2} style={styles.contactPhone}>
          {contactMeta(contact.primaryPhone)}
        </AppText>
      </View>
      <Pressable
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [
          styles.contactActionButton,
          { backgroundColor: actionBackgroundColor },
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Ionicons
          color={activeTheme.colors.white}
          name={busy ? 'sync-outline' : action.icon}
          size={14}
        />
        <AppText numberOfLines={1} style={styles.contactActionText}>
          {busy ? '...' : action.label}
        </AppText>
      </Pressable>
    </View>
  );
}
