import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { ActivityInviteRequestCard } from '@/features/activity/activity-invite-request-card';
import { MessageBanner } from '@/components/message-banner';
import { SurfaceCard } from '@/components/surface-card';
import { SwipePager } from '@/components/swipe-pager';
import { CardActorAvatar } from '@/components/card-actor-avatar';
import { dashboardStyles as styles } from '@/features/home/dashboard-screen.styles';
import { initialsBackgroundColor } from '@/features/home/dashboard-preview-cards';
import { triggerAppActionHaptic, triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { resolveAvatarUrl } from '@/lib/avatar';
import { cardStateIntentFromStatus } from '@/lib/card-language';
import { useAppTheme } from '@/providers/theme-provider';
import {
  INVITE_REQUEST_TABS,
  displayNameForInvite,
  inviteAccentBackgroundColor,
  inviteAccentColor,
  inviteCardIcon,
  inviteRequestEmptyDescription,
  inviteRequestEmptyTitle,
  inviteRequestMeta,
  isActiveQrInvite,
  shouldShowRespondingInviteProfile,
  type InviteRequestAction,
  type InviteRequestItem,
  type InviteRequestsTab,
} from './dashboard-helpers';
import type { PersonCardDto } from '@happy-circles/application';
import { AppText } from '@/components/app-text';

function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function InviteRequestTabButton({
  count,
  label,
  selected,
  onPress,
}: {
  readonly count: number;
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const activeTheme = useAppTheme();

  return (
    <Pressable
      onPress={() => {
        triggerAppSelectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.sheetTab,
        selected
          ? [styles.sheetTabActive, { borderBottomColor: activeTheme.colors.primary }]
          : null,
        pressed ? styles.quickActionPressed : null,
      ]}
    >
      <AppText
        style={[
          styles.sheetTabText,
          { color: activeTheme.colors.textMuted },
          selected ? { color: activeTheme.colors.text } : null,
        ]}
      >
        {label}
      </AppText>
      {count > 0 ? (
        <View style={[styles.sheetTabBadge, { backgroundColor: activeTheme.colors.danger }]}>
          <AppText style={styles.sheetTabBadgeText}>{badgeLabel(count)}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export function InviteRequestRow({
  item,
  busyKey,
  onAction,
}: {
  readonly item: InviteRequestItem;
  readonly busyKey: string | null;
  readonly onAction: (item: InviteRequestItem, action: InviteRequestAction) => void;
}) {
  const activeTheme = useAppTheme();
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
  const fallbackPerson: PersonCardDto = {
    userId: item.inviteId,
    displayName,
    avatarUrl: null,
    direction: 'settled',
    lastActivityLabel: '',
    netAmountMinor: 0,
    pendingCount: 0,
  };
  const requiresAction =
    item.actionState === 'requires_you_response' || item.actionState === 'requires_you_review';
  const actorIntent = requiresAction
    ? 'needsAction'
    : item.actionState === 'history'
      ? cardStateIntentFromStatus(item.status)
      : cardStateIntentFromStatus(item.actionState);
  const haloIntensity = requiresAction ? 'strong' : 'soft';

  const actionContent =
    item.actionState === 'requires_you_response' ? (
      <View style={styles.requestActions}>
        <Pressable
          accessibilityLabel="Rechazar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppSelectionHaptic();
            onAction(item, 'reject');
          }}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonDanger,
            {
              backgroundColor: activeTheme.colors.dangerSoft,
              borderColor: activeTheme.colors.dangerSoft,
            },
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.danger} name="close-circle-outline" size={16} />
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
            styles.requestIconButton,
            styles.requestIconButtonPrimary,
            {
              backgroundColor: activeTheme.colors.primaryGhost,
              borderColor: activeTheme.colors.primaryGhost,
            },
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.primary} name="checkmark-circle" size={16} />
        </Pressable>
      </View>
    ) : item.actionState === 'requires_you_review' ? (
      <View style={styles.requestActions}>
        <Pressable
          accessibilityLabel="Rechazar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppSelectionHaptic();
            onAction(item, 'reject');
          }}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonDanger,
            {
              backgroundColor: activeTheme.colors.dangerSoft,
              borderColor: activeTheme.colors.dangerSoft,
            },
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.danger} name="close-circle-outline" size={16} />
        </Pressable>
        <Pressable
          accessibilityLabel="Aceptar solicitud"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppActionHaptic();
            onAction(item, 'approve');
          }}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonPrimary,
            {
              backgroundColor: activeTheme.colors.primaryGhost,
              borderColor: activeTheme.colors.primaryGhost,
            },
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.primary} name="checkmark-circle" size={16} />
        </Pressable>
      </View>
    ) : (item.kind === 'friendship_invite' && item.actionState === 'pending_claim') ||
      (item.kind === 'account_invite' &&
        item.actionState === 'pending_activation' &&
        !item.activatedUserId) ? (
      <View style={[styles.requestActions, styles.requestSingleActionRow]}>
        <Pressable
          accessibilityLabel="Cancelar invitación"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => {
            triggerAppSelectionHaptic();
            onAction(item, 'cancel');
          }}
          style={({ pressed }) => [
            styles.requestIconButton,
            styles.requestIconButtonDanger,
            {
              backgroundColor: activeTheme.colors.dangerSoft,
              borderColor: activeTheme.colors.dangerSoft,
            },
            pressed ? styles.quickActionPressed : null,
            isBusy ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.danger} name="close-circle-outline" size={15} />
        </Pressable>
      </View>
    ) : null;
  const typeIcon = (
    <View style={[styles.requestTypeIcon, { backgroundColor: accentBackgroundColor }]}>
      <Ionicons color={accentColor} name={inviteCardIcon(item)} size={15} />
    </View>
  );
  const profileContent = (
    <View style={styles.requestPersonRow}>
      <View style={styles.requestAvatarSlot}>
        <CardActorAvatar haloIntensity={haloIntensity} haloSize={60} intent={actorIntent} size={48}>
          <AppAvatar
            fallbackBackgroundColor={initialsBackgroundColor(fallbackPerson)}
            fallbackTextColor={activeTheme.colors.white}
            imageUrl={avatarUrl}
            label={displayName}
            size={48}
          />
        </CardActorAvatar>
      </View>
      <View style={styles.requestPersonCopy}>
        <AppText numberOfLines={1} style={styles.requestPersonName}>
          {displayName}
        </AppText>
        <AppText numberOfLines={1} style={styles.requestPersonMeta}>
          {meta}
        </AppText>
      </View>
    </View>
  );

  return (
    <SurfaceCard
      padding="md"
      style={[styles.requestCard, { borderLeftColor: accentColor }]}
      variant="elevated"
    >
      <View style={styles.requestCardHeader}>
        {profileContent}
        <View style={styles.requestHeaderSide}>
          {actionContent ? (
            <>
              {isActiveQrInvite(item) ? typeIcon : null}
              {actionContent}
            </>
          ) : (
            typeIcon
          )}
        </View>
      </View>
    </SurfaceCard>
  );
}

export function InviteRequestsSheet({
  activeTab,
  busyKey,
  historyItems,
  message,
  onAction,
  onChangeTab,
  onClose,
  onOpenPerson,
  receivedItems,
  sentItems,
  visible,
}: {
  readonly activeTab: InviteRequestsTab;
  readonly busyKey: string | null;
  readonly historyItems: readonly InviteRequestItem[];
  readonly message: string | null;
  readonly onAction: (item: InviteRequestItem, action: InviteRequestAction) => void;
  readonly onChangeTab: (tab: InviteRequestsTab) => void;
  readonly onClose: () => void;
  readonly onOpenPerson?: (href: Href) => void;
  readonly receivedItems: readonly InviteRequestItem[];
  readonly sentItems: readonly InviteRequestItem[];
  readonly visible: boolean;
}) {
  const activeTheme = useAppTheme();
  const [visualTab, setVisualTab] = useState<InviteRequestsTab>(activeTab);

  useEffect(() => {
    setVisualTab(activeTab);
  }, [activeTab]);

  function changeTab(tab: InviteRequestsTab) {
    setVisualTab(tab);
    onChangeTab(tab);
  }

  function renderRequestPage(tab: InviteRequestsTab) {
    const items = tab === 'received' ? receivedItems : tab === 'sent' ? sentItems : historyItems;

    return (
      <ScrollView
        contentContainerStyle={[
          styles.requestList,
          items.length === 0 ? styles.requestListEmpty : null,
        ]}
        showsVerticalScrollIndicator={false}
        style={[styles.requestScroll, { backgroundColor: activeTheme.colors.surface }]}
      >
        {items.length === 0 ? (
          <View style={styles.sheetEmpty}>
            <AppText style={styles.sheetEmptyTitle}>{inviteRequestEmptyTitle(tab)}</AppText>
            <AppText style={styles.sheetEmptyText}>{inviteRequestEmptyDescription(tab)}</AppText>
          </View>
        ) : (
          items.map((item) => (
            <ActivityInviteRequestCard
              busyKey={busyKey}
              item={item}
              key={`${item.kind}:${item.inviteId}`}
              onAction={onAction}
              onOpenPerson={onOpenPerson}
            />
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.sheetScrim, { backgroundColor: activeTheme.colors.overlay }]}>
        <Pressable onPress={onClose} style={styles.sheetBackdrop} />
        <View style={[styles.friendshipSheet, { backgroundColor: activeTheme.colors.surface }]}>
          <View style={styles.sheetHeader}>
            <AppText style={styles.sheetTitle}>Solicitudes</AppText>
            <Pressable onPress={onClose} style={styles.sheetCloseButton}>
              <Ionicons color={activeTheme.colors.text} name="close" size={22} />
            </Pressable>
          </View>
          <View style={[styles.sheetTabs, { borderBottomColor: activeTheme.colors.hairline }]}>
            <InviteRequestTabButton
              count={receivedItems.length}
              label="Recibidas"
              onPress={() => changeTab('received')}
              selected={visualTab === 'received'}
            />
            <InviteRequestTabButton
              count={sentItems.length}
              label="Enviadas"
              onPress={() => changeTab('sent')}
              selected={visualTab === 'sent'}
            />
            <InviteRequestTabButton
              count={historyItems.length}
              label="Histórico"
              onPress={() => changeTab('history')}
              selected={visualTab === 'history'}
            />
          </View>
          {message ? <MessageBanner message={message} tone="neutral" /> : null}
          <SwipePager
            accessibilityLabel="Pestañas de solicitudes"
            onChange={changeTab}
            onPreviewChange={setVisualTab}
            pageStyle={{ backgroundColor: activeTheme.colors.surface }}
            renderPage={(tab) => renderRequestPage(tab)}
            style={[styles.requestPager, { backgroundColor: activeTheme.colors.surface }]}
            value={activeTab}
            values={INVITE_REQUEST_TABS}
          />
        </View>
      </View>
    </Modal>
  );
}
