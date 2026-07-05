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
  const displayPhone =
    contact.phoneOptions.find((phoneOption) => phoneOption.phoneE164 === resolution?.phoneE164) ??
    contact.primaryPhone;
  const phoneMeta = contactMeta(displayPhone);
  const detailMeta = contactResolutionDetail(phoneMeta, resolution);
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
          {detailMeta}
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
          {busy ? 'Preparando' : action.label}
        </AppText>
      </Pressable>
    </View>
  );
}

function contactResolutionDetail(
  phoneMeta: string,
  resolution: PeopleTargetResolution | null,
): string {
  if (!resolution) {
    return `${phoneMeta} | Consulta si está en Happy Circles`;
  }

  if (resolution.status === 'active_user') {
    return `${phoneMeta} | Está en Happy Circles`;
  }

  if (resolution.status === 'already_related') {
    return `${phoneMeta} | Ya son amigos`;
  }

  if (resolution.status === 'pending_friendship') {
    return `${phoneMeta} | Solicitud pendiente`;
  }

  if (resolution.status === 'pending_activation') {
    return `${phoneMeta} | Pendiente de abrir`;
  }

  return `${phoneMeta} | No aparece en Happy Circles`;
}
