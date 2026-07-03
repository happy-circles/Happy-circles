import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ActivityItemCard } from '@/components/activity-item-card';
import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { CardActorAvatar } from '@/components/card-actor-avatar';
import { CardPressable } from '@/components/card-shell';
import {
  canCancelInviteRequest,
  canResendInviteRequest,
  displayNameForInvite,
  inviteAccentBackgroundColor,
  inviteAccentColor,
  inviteCardIcon,
  inviteRequestPersonHref,
  inviteRequestMeta,
  inviteRequestResendLabel,
  isActiveQrInvite,
  shouldShowRespondingInviteProfile,
  type InviteRequestAction,
  type InviteRequestItem,
} from '@/features/home/dashboard-helpers';
import { triggerAppActionHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { resolveAvatarUrl } from '@/lib/avatar';
import { cardStateIntentFromStatus } from '@/lib/card-language';
import { theme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

import { activityScreenStyles as styles } from './activity-screen.styles';

function avatarColorForLabel(label: string, activeTheme: AppTheme = theme): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return (
    activeTheme.palette.notificationAvatar[hash % activeTheme.palette.notificationAvatar.length] ??
    activeTheme.colors.primary
  );
}

export function ActivityInviteRequestCard({
  busyKey,
  item,
  onAction,
  onOpenPerson,
}: {
  readonly busyKey: string | null;
  readonly item: InviteRequestItem;
  readonly onAction: (item: InviteRequestItem, action: InviteRequestAction) => void;
  readonly onOpenPerson?: (href: Href) => void;
}) {
  const activeTheme = useAppTheme();
  const displayName = displayNameForInvite(item);
  const meta = inviteRequestMeta(item);
  const accentColor = inviteAccentColor(item);
  const accentBackgroundColor = inviteAccentBackgroundColor(item);
  const personHref = inviteRequestPersonHref(item);
  const canOpenPerson = Boolean(personHref && onOpenPerson);
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
  const canCancel = canCancelInviteRequest(item);
  const canResend = canResendInviteRequest(item);
  const resendLabel = inviteRequestResendLabel(item);
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
            {
              backgroundColor: activeTheme.colors.dangerSoft,
              borderColor: activeTheme.colors.dangerSoft,
            },
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.danger} name="close-circle-outline" size={21} />
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
            {
              backgroundColor: activeTheme.colors.primarySoft,
              borderColor: activeTheme.colors.primaryGhost,
            },
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.primary} name="checkmark-circle" size={21} />
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
            {
              backgroundColor: activeTheme.colors.dangerSoft,
              borderColor: activeTheme.colors.dangerSoft,
            },
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.danger} name="close-circle-outline" size={21} />
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
            {
              backgroundColor: activeTheme.colors.primarySoft,
              borderColor: activeTheme.colors.primaryGhost,
            },
            pressed ? styles.tabButtonPressed : null,
            isBusy ? styles.notificationInviteDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.primary} name="checkmark-circle" size={21} />
        </Pressable>
      </View>
    ) : canResend || canCancel ? (
      <View style={styles.notificationInviteActions}>
        {canResend ? (
          <Pressable
            accessibilityLabel={resendLabel}
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => {
              triggerAppActionHaptic();
              onAction(item, 'resend');
            }}
            style={({ pressed }) => [
              styles.notificationInviteIconButton,
              styles.notificationInviteIconButtonPrimary,
              {
                backgroundColor: activeTheme.colors.primarySoft,
                borderColor: activeTheme.colors.primaryGhost,
              },
              pressed ? styles.tabButtonPressed : null,
              isBusy ? styles.notificationInviteDisabled : null,
            ]}
          >
            <Ionicons
              color={activeTheme.colors.primary}
              name="refresh-circle-outline"
              size={21}
            />
          </Pressable>
        ) : null}
        {canCancel ? (
          <Pressable
            accessibilityLabel="Cancelar solicitud enviada"
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => {
              triggerAppSelectionHaptic();
              onAction(item, 'cancel');
            }}
            style={({ pressed }) => [
              styles.notificationInviteIconButton,
              styles.notificationInviteIconButtonDanger,
              {
                backgroundColor: activeTheme.colors.dangerSoft,
                borderColor: activeTheme.colors.dangerSoft,
              },
              pressed ? styles.tabButtonPressed : null,
              isBusy ? styles.notificationInviteDisabled : null,
            ]}
          >
            <Ionicons color={activeTheme.colors.danger} name="close-circle-outline" size={21} />
          </Pressable>
        ) : null}
      </View>
    ) : null;

  const card = (
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
            fallbackBackgroundColor={avatarColorForLabel(displayName, activeTheme)}
            fallbackTextColor={activeTheme.colors.white}
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
          {!actionContent && canOpenPerson ? (
            <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={18} />
          ) : null}
        </View>
      }
      title={displayName}
      unread={requiresAction}
    />
  );

  if (!personHref || !onOpenPerson) {
    return card;
  }

  return (
    <CardPressable
      accessibilityLabel={`Abrir perfil de ${displayName}`}
      accessibilityRole="button"
      haptic="selection"
      onPress={() => onOpenPerson(personHref)}
    >
      {card}
    </CardPressable>
  );
}
