import { Ionicons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput, type AppTextInputRef } from '@/components/app-text-input';
import { HappyFacesCounter } from '@/components/happy-faces-counter';
import { IdentityFlowIdentity } from '@/components/identity-flow';
import { styles } from './profile-screen-runtime.styles';

interface ProfileAccountHeaderProps {
  readonly accountEmail: string;
  readonly accountLabel: string;
  readonly accountNameIconButtonThemeStyle: {
    readonly backgroundColor: string;
    readonly borderColor: string;
  };
  readonly activeTheme: {
    readonly colors: {
      readonly primary: string;
      readonly textMuted: string;
    };
  };
  readonly avatarBusy: boolean;
  readonly busyAction: string | null;
  readonly displayNameDraft: string;
  readonly displayNameEditing: boolean;
  readonly displayNameInputRef: RefObject<AppTextInputRef | null>;
  readonly happyCircleClosedCount: number;
  readonly happyCircleFaces: number;
  readonly onAvatarPress: () => void;
  readonly onCancelDisplayNameEdit: () => void;
  readonly onChangeDisplayNameDraft: (value: string) => void;
  readonly onOpenHappyFaces: () => void;
  readonly onSaveDisplayName: () => void;
  readonly onStartDisplayNameEdit: () => void;
  readonly profileAvatarUrl: string | null;
}

export function ProfileAccountHeader({
  accountEmail,
  accountLabel,
  accountNameIconButtonThemeStyle,
  activeTheme,
  avatarBusy,
  busyAction,
  displayNameDraft,
  displayNameEditing,
  displayNameInputRef,
  happyCircleClosedCount,
  happyCircleFaces,
  onAvatarPress,
  onCancelDisplayNameEdit,
  onChangeDisplayNameDraft,
  onOpenHappyFaces,
  onSaveDisplayName,
  onStartDisplayNameEdit,
  profileAvatarUrl,
}: ProfileAccountHeaderProps) {
  return (
    <View style={styles.accountHeader}>
      <View style={styles.profileScoreRow}>
        <HappyFacesCounter
          compact
          closedCircleCount={happyCircleClosedCount}
          onPress={onOpenHappyFaces}
          totalFaces={happyCircleFaces}
          variant="reward"
        />
      </View>
      <IdentityFlowIdentity
        avatarLabel={accountLabel}
        avatarUrl={profileAvatarUrl}
        disabled={avatarBusy}
        editable
        onPress={onAvatarPress}
        variant="avatar"
      />
      <View style={styles.accountCopy}>
        {displayNameEditing ? (
          <View style={styles.accountNameEditor}>
            <AppTextInput
              accessibilityLabel="Nombre"
              autoCapitalize="words"
              density="compact"
              editable={busyAction !== 'display-name'}
              onChangeText={onChangeDisplayNameDraft}
              onSubmitEditing={onSaveDisplayName}
              placeholder="Nombre y apellido"
              ref={displayNameInputRef}
              returnKeyType="done"
              selectTextOnFocus
              style={styles.accountNameInput}
              value={displayNameDraft}
            />
            <View style={styles.accountNameActions}>
              <Pressable
                accessibilityLabel="Guardar nombre"
                accessibilityRole="button"
                disabled={busyAction !== null}
                hitSlop={8}
                onPress={onSaveDisplayName}
                style={({ pressed }) => [
                  styles.accountNameIconButton,
                  accountNameIconButtonThemeStyle,
                  pressed && busyAction === null ? styles.rowPressed : null,
                  busyAction !== null ? styles.disabledButton : null,
                ]}
              >
                <Ionicons color={activeTheme.colors.primary} name="checkmark" size={18} />
              </Pressable>
              <Pressable
                accessibilityLabel="Cancelar edición de nombre"
                accessibilityRole="button"
                disabled={busyAction === 'display-name'}
                hitSlop={8}
                onPress={onCancelDisplayNameEdit}
                style={({ pressed }) => [
                  styles.accountNameIconButton,
                  accountNameIconButtonThemeStyle,
                  pressed && busyAction !== 'display-name' ? styles.rowPressed : null,
                  busyAction === 'display-name' ? styles.disabledButton : null,
                ]}
              >
                <Ionicons color={activeTheme.colors.textMuted} name="close" size={18} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.accountNameRow}>
            <AppText numberOfLines={2} style={styles.accountValue}>
              {accountLabel}
            </AppText>
            <Pressable
              accessibilityLabel="Editar nombre"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onStartDisplayNameEdit}
              style={({ pressed }) => [
                styles.accountNameIconButton,
                accountNameIconButtonThemeStyle,
                pressed ? styles.rowPressed : null,
              ]}
            >
              <Ionicons color={activeTheme.colors.textMuted} name="pencil" size={16} />
            </Pressable>
          </View>
        )}
        <AppText style={styles.accountMeta}>{accountEmail}</AppText>
      </View>
    </View>
  );
}
