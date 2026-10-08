import { View } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryAction } from '@/components/primary-action';
import { useAppTheme } from '@/providers/theme-provider';
import { formatPhonePreview } from '@/features/invites/people-outreach-utils';
import { addPersonContactsSheetStyles as styles } from './add-person-contacts-sheet.styles';

export function AddPersonManualInviteCard({
  phoneE164,
  busy,
  disabled,
  onPress,
}: {
  readonly phoneE164: string | null;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const theme = useAppTheme();
  if (!phoneE164) return null;
  return (
    <View
      style={[
        styles.manualInviteCard,
        { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.manualInviteCopy}>
        <AppText style={styles.manualInviteTitle}>Invitación directa</AppText>
        <AppText style={styles.emptyText}>{formatPhonePreview(phoneE164)}</AppText>
      </View>
      <PrimaryAction
        compact
        disabled={disabled}
        icon="paper-plane-outline"
        label={busy ? 'Enviando...' : 'Agregar o invitar'}
        loading={busy}
        onPress={onPress}
      />
    </View>
  );
}

export function resolveManualInviteAlias(searchValue: string, phoneE164: string): string {
  const namePart = searchValue
    .replace(/[+\d().\-\s]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

  return namePart.length > 0 ? namePart : formatPhonePreview(phoneE164);
}
