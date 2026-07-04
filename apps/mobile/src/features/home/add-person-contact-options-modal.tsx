import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PrimaryAction } from '@/components/primary-action';
import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import {
  actionMetaForResolution,
  contactMeta,
  type EnrichedContact,
} from '@/features/home/contacts-sheet-helpers';
import type { PendingContactSelection } from '@/features/invites/people-outreach-utils';
import { useAppTheme } from '@/providers/theme-provider';

type CreateOutreachInput = {
  readonly alias: string;
  readonly phoneE164: string;
  readonly phoneLabel?: string | null;
  readonly sourceContext: string;
};

export function AddPersonContactOptionsModal({
  busyKey,
  inviteAvailableLabel,
  onCancel,
  onCreateOutreach,
  onReviewPhone,
  pendingContactOptions,
  pendingContactSelection,
}: {
  readonly busyKey: string | null;
  readonly inviteAvailableLabel: string;
  readonly onCancel: () => void;
  readonly onCreateOutreach: (input: CreateOutreachInput) => Promise<void>;
  readonly onReviewPhone: (input: { readonly phoneE164: string }) => Promise<void>;
  readonly pendingContactOptions: readonly EnrichedContact[];
  readonly pendingContactSelection: PendingContactSelection | null;
}) {
  const activeTheme = useAppTheme();
  const pendingContactOptionsResolving = pendingContactOptions.some(
    ({ resolution }) => !resolution,
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={pendingContactSelection !== null}
    >
      <View style={[styles.optionScrim, { backgroundColor: activeTheme.colors.overlay }]}>
        <Pressable onPress={onCancel} style={styles.sheetBackdrop} />
        <View style={[styles.optionCard, { backgroundColor: activeTheme.colors.surface }]}>
          <AppText style={styles.optionTitle}>Elige el número</AppText>
          <AppText style={styles.emptyText}>
            {pendingContactSelection ? `${pendingContactSelection.alias} tiene varios números.` : ''}
          </AppText>
          {pendingContactOptionsResolving ? (
            <View style={styles.optionNotice}>
              <Ionicons color={activeTheme.colors.primary} name="sync-outline" size={16} />
              <AppText style={styles.optionNoticeText}>
                Consultando cada número para saber si se agrega o se invita.
              </AppText>
            </View>
          ) : null}
          <View style={styles.optionList}>
            {pendingContactOptions.map(({ contact, resolution }) => {
              const phoneOption = contact.primaryPhone;
              const action = actionMetaForResolution(resolution, false);
              const isResolving = !resolution;
              const isBusy = busyKey === phoneOption.phoneE164;
              const disabled = (action.disabled && !isResolving) || Boolean(busyKey);

              return (
                <View
                  key={phoneOption.id}
                  style={[styles.optionRow, { backgroundColor: activeTheme.colors.surfaceMuted }]}
                >
                  <View style={styles.contactCopy}>
                    <AppText style={styles.contactName}>{contactMeta(phoneOption)}</AppText>
                    <AppText style={styles.contactPhone}>
                      {contactOptionStatusLabel(resolution, inviteAvailableLabel)}
                    </AppText>
                  </View>
                  <Pressable
                    disabled={disabled}
                    onPress={
                      disabled || !pendingContactSelection
                        ? undefined
                        : isResolving
                          ? () => {
                              void onReviewPhone({ phoneE164: phoneOption.phoneE164 });
                            }
                          : () => {
                              onCancel();
                              void onCreateOutreach({
                                alias: pendingContactSelection.alias,
                                phoneE164: phoneOption.phoneE164,
                                phoneLabel: phoneOption.label,
                                sourceContext: 'home_add_contact_option',
                              });
                            }
                    }
                    style={({ pressed }) => [
                      styles.contactActionButton,
                      {
                        backgroundColor:
                          action.tone === 'invite'
                            ? activeTheme.colors.warning
                            : action.tone === 'muted'
                              ? activeTheme.colors.muted
                              : activeTheme.colors.primary,
                      },
                      pressed && !disabled ? styles.pressed : null,
                      disabled ? styles.disabled : null,
                    ]}
                  >
                    <Ionicons
                      color={activeTheme.colors.white}
                      name={isBusy ? 'sync-outline' : action.icon}
                      size={14}
                    />
                    <AppText style={styles.contactActionText}>
                      {isBusy ? 'Revisando' : action.label}
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
            <PrimaryAction compact label="Cancelar" onPress={onCancel} variant="ghost" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function contactOptionStatusLabel(
  resolution: EnrichedContact['resolution'],
  inviteAvailableLabel: string,
): string {
  if (!resolution) {
    return 'Listo para revisar';
  }

  if (resolution.status === 'active_user') {
    return 'Está en Happy Circles';
  }

  if (resolution.status === 'already_related') {
    return 'Ya son amigos';
  }

  if (resolution.status === 'pending_friendship') {
    return 'Pendiente';
  }

  if (resolution.status === 'pending_activation') {
    return 'Pendiente de abrir';
  }

  return inviteAvailableLabel;
}
