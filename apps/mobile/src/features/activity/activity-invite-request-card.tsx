import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { CardActorAvatar } from '@/components/card-actor-avatar';
import {
  displayNameForInvite,
  inviteAccentBackgroundColor,
  inviteAccentColor,
  inviteCardIcon,
  inviteRequestMeta,
  isActiveQrInvite,
  shouldShowRespondingInviteProfile,
  type InviteRequestAction,
  type InviteRequestItem,
} from '@/features/home/dashboard-helpers';
import { triggerAppActionHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { resolveAvatarUrl } from '@/lib/avatar';
import { cardStateIntentFromStatus } from '@/lib/card-language';
import { theme } from '@/lib/theme';

import { activityScreenStyles as styles } from './activity-screen.styles';

const NOTIFICATION_AVATAR_COLORS = [
  '#0f8a5f',
  '#2563eb',
  '#a35f19',
  '#7c3aed',
  '#b24338',
  '#141e33',
];

function avatarColorForLabel(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return (
    NOTIFICATION_AVATAR_COLORS[hash % NOTIFICATION_AVATAR_COLORS.length] ?? theme.colors.primary
  );
}

export function ActivityInviteRequestCard({
  busyKey,
  item,
  onAction,
}: {
  readonly busyKey: string | null;
  readonly item: InviteRequestItem;
  readonly onAction: (item: InviteRequestItem, action: InviteRequestAction) => void;
}) {
  const displayName = displayNameForInvite(item);
  const meta = inviteRequestMeta(item);
  const accentColor = inviteAccentColor(item);
  const accentBackgroundColor = inviteAccentBackgroundColor(item);
  const busyPrefix = `${item.kind}:${item.inviteId}:`;
  const isBusy = Boolean(busyKey?.startsWith(busyPrefix));
  const showRespondingProfile = shouldShowRespondingInviteProfile(item);
  const avatarUrl =
    (showRespondingProfile ? item.respondingProfileAvatarUrl : null) ??
    item.profileAvatarUrl ??
    (item.kind === 'friendship_invite'
      ? showRespondingProfile
        ? resolveAvatarUrl(item.claimantSnapshot?.avatarPath ?? null)
        : null
      : showRespondingProfile
        ? item.activatedUserAvatarUrl
        : null);
  const requiresAction =
    item.actionState === 'requires_you_response' || item.actionState === 'requires_you_review';
  const actorIntent = requiresAction
    ? 'needsAction'
    : item.actionState === 'history'
      ? cardStateIntentFromStatus(item.status)
      : cardStateIntentFromStatus(item.actionState);
  const haloIntensity = requiresAction ? 'strong' : 'soft';
  const typeIcon = (
    <View style={[styles.notificationInviteTypeIcon, { backgroundColor: accentBackgroundColor }]}>
      <Ionicons color={accentColor} name={inviteCardIcon(item)} size={15} />
    </View>
  );

  const actionContent =
    item.actionState === 'requires_you_response' ? (
      <View style={styles.notificationInviteActions}>
        <Pressable
          accessibilityLabel="Rechazar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppSelectionHaptic();
            onAction(item, 'reject');
          }}
          style={({ pressed }) => [
            styles.notificationInviteIconButton,
            styles.notificationInviteIconButtonDanger,
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.danger} name="close-circle-outline" size={16} />
        </Pressable>
        <Pressable
          accessibilityLabel="Aceptar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppActionHaptic();
            onAction(item, 'accept');
          }}
          style={({ pressed }) => [
            styles.notificationInviteIconButton,
            styles.notificationInviteIconButtonPrimary,
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.primary} name="checkmark-circle" size={16} />
        </Pressable>
      </View>
    ) : item.actionState === 'requires_you_review' ? (
      <View style={styles.notificationInviteActions}>
        <Pressable
          accessibilityLabel="Rechazar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppSelectionHaptic();
            onAction(item, 'reject');
          }}
          style={({ pressed }) => [
            styles.notificationInviteIconButton,
            styles.notificationInviteIconButtonDanger,
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.danger} name="close-circle-outline" size={16} />
        </Pressable>
        <Pressable
          accessibilityLabel="Aprobar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppActionHaptic();
            onAction(item, 'approve');
          }}
          style={({ pressed }) => [
            styles.notificationInviteIconButton,
            styles.notificationInviteIconButtonPrimary,
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.primary} name="checkmark-circle" size={16} />
        </Pressable>
      </View>
    ) : (item.kind === 'friendship_invite' && item.actionState === 'pending_claim') ||
      (item.kind === 'account_invite' &&
        item.actionState === 'pending_activation' &&
        !item.activatedUserId) ? (
      <View style={styles.notificationInviteActions}>
        <Pressable
          accessibilityLabel="Cancelar invitación"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppSelectionHaptic();
            onAction(item, 'cancel');
          }}
          style={({ pressed }) => [
            styles.notificationInviteIconButton,
            styles.notificationInviteIconButtonDanger,
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={theme.colors.danger} name="close-circle-outline" size={15} />
        </Pressable>
      </View>
    ) : null;

  return (
    <ActivityItemCard
      accentColor={accentColor}
      attentionDot={requiresAction}
      compact
      leadingNode={
        <CardActorAvatar
          haloIntensity={haloIntensity}
          haloSize={54}
          intent={actorIntent}
          size={42}
        >
          <AppAvatar
            fallbackBackgroundColor={avatarColorForLabel(displayName)}
            fallbackTextColor={theme.colors.white}
            imageUrl={avatarUrl}
            label={displayName}
            size={42}
          />
        </CardActorAvatar>
      }
      metaNode={
        <AppText numberOfLines={2} style={styles.notificationActionMeta}>
          {meta}
        </AppText>
      }
      sideNode={
        <View style={styles.notificationInviteSide}>
          {actionContent && isActiveQrInvite(item) ? typeIcon : null}
          {actionContent ?? typeIcon}
        </View>
      }
      title={displayName}
      unread={requiresAction}
    />
  );
}
