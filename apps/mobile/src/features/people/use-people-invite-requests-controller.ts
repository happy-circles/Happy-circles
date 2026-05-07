import { useCallback, useMemo, useState } from 'react';

import {
  isReceivedInvite,
  isSentInvite,
  isVisibleInviteHistory,
  sortInviteHistoryItems,
  sortInviteRequestItems,
  type InviteRequestAction,
  type InviteRequestItem,
  type InviteRequestsTab,
} from '@/features/home/dashboard-helpers';
import {
  useCancelAccountInviteMutation,
  useCancelFriendshipInviteMutation,
  useRespondInternalFriendshipInviteMutation,
  useReviewAccountInviteMutation,
  useReviewExternalFriendshipInviteMutation,
  type AccountInviteListItem,
  type FriendshipInviteListItem,
} from '@/lib/live-data';
import {
  triggerIdentityErrorHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';

export function parseInviteRequestsTabParam(value: string | undefined): InviteRequestsTab | null {
  if (value === 'received' || value === 'sent' || value === 'history') {
    return value;
  }

  return null;
}

export function usePeopleInviteRequestsController({
  accountInviteHistoryItems,
  accountInvitePendingItems,
  friendshipHistoryItems,
  friendshipPendingItems,
}: {
  readonly accountInviteHistoryItems: readonly AccountInviteListItem[];
  readonly accountInvitePendingItems: readonly AccountInviteListItem[];
  readonly friendshipHistoryItems: readonly FriendshipInviteListItem[];
  readonly friendshipPendingItems: readonly FriendshipInviteListItem[];
}) {
  const respondInternalInvite = useRespondInternalFriendshipInviteMutation();
  const reviewExternalInvite = useReviewExternalFriendshipInviteMutation();
  const reviewAccountInvite = useReviewAccountInviteMutation();
  const cancelAccountInvite = useCancelAccountInviteMutation();
  const cancelFriendshipInvite = useCancelFriendshipInviteMutation();
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<InviteRequestsTab>('received');
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pendingItems = useMemo(
    () => sortInviteRequestItems([...friendshipPendingItems, ...accountInvitePendingItems]),
    [accountInvitePendingItems, friendshipPendingItems],
  );
  const historyItems = useMemo(
    () =>
      sortInviteHistoryItems(
        [...friendshipHistoryItems, ...accountInviteHistoryItems].filter(isVisibleInviteHistory),
      ),
    [accountInviteHistoryItems, friendshipHistoryItems],
  );
  const receivedItems = useMemo(() => pendingItems.filter(isReceivedInvite), [pendingItems]);
  const sentItems = useMemo(() => pendingItems.filter(isSentInvite), [pendingItems]);
  const preferredTab: InviteRequestsTab =
    receivedItems.length > 0 ? 'received' : sentItems.length > 0 ? 'sent' : 'history';

  const open = useCallback((nextTab: InviteRequestsTab = preferredTab) => {
    setMessage(null);
    setActiveTab(nextTab);
    setVisible(true);
  }, [preferredTab]);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const handleAction = useCallback(async (item: InviteRequestItem, action: InviteRequestAction) => {
    const key = `${item.kind}:${item.inviteId}:${action}`;
    setBusyKey(key);
    setMessage(null);

    try {
      if (item.kind === 'friendship_invite' && item.actionState === 'requires_you_response') {
        await respondInternalInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'accept' ? 'accept' : 'reject',
        });
        if (action === 'accept') {
          triggerIdentitySuccessHaptic();
        } else {
          triggerIdentityWarningHaptic();
        }
        setMessage(action === 'accept' ? 'Invitacion aceptada.' : 'Invitacion rechazada.');
        return;
      }

      if (item.kind === 'friendship_invite' && item.actionState === 'requires_you_review') {
        await reviewExternalInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        if (action === 'approve') {
          triggerIdentitySuccessHaptic();
        } else {
          triggerIdentityWarningHaptic();
        }
        setMessage(action === 'approve' ? 'Conexion confirmada.' : 'Invitacion cerrada.');
        return;
      }

      if (item.kind === 'account_invite' && item.actionState === 'requires_you_review') {
        await reviewAccountInvite.mutateAsync({
          inviteId: item.inviteId,
          decision: action === 'approve' ? 'approve' : 'reject',
        });
        if (action === 'approve') {
          triggerIdentitySuccessHaptic();
        } else {
          triggerIdentityWarningHaptic();
        }
        setMessage(action === 'approve' ? 'Acceso confirmado.' : 'Invitacion de acceso cerrada.');
        return;
      }

      if (
        item.kind === 'friendship_invite' &&
        item.actionState === 'pending_claim' &&
        action === 'cancel'
      ) {
        await cancelFriendshipInvite.mutateAsync(item.inviteId);
        triggerIdentityWarningHaptic();
        setMessage('Invitacion cancelada.');
        return;
      }

      if (
        item.kind === 'account_invite' &&
        item.actionState === 'pending_activation' &&
        !item.activatedUserId &&
        action === 'cancel'
      ) {
        await cancelAccountInvite.mutateAsync(item.inviteId);
        triggerIdentityWarningHaptic();
        setMessage('Invitacion de acceso cancelada.');
      }
    } catch (error) {
      triggerIdentityErrorHaptic();
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }, [
    cancelAccountInvite,
    cancelFriendshipInvite,
    respondInternalInvite,
    reviewAccountInvite,
    reviewExternalInvite,
  ]);

  return {
    activeTab,
    busyKey,
    close,
    handleAction,
    historyItems,
    message,
    open,
    preferredTab,
    receivedItems,
    requestCount: receivedItems.length + sentItems.length,
    sentItems,
    setActiveTab,
    visible,
  };
}
