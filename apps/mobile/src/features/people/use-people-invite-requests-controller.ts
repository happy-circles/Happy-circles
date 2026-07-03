import { useCallback, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import {
  canResendInviteRequest,
  displayNameForInvite,
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
  useCreateExternalFriendshipInviteMutation,
  useCreateInternalFriendshipInviteMutation,
  useCreatePeopleOutreachMutation,
  useRespondInternalFriendshipInviteMutation,
  useReviewAccountInviteMutation,
  useReviewExternalFriendshipInviteMutation,
  type AccountInviteDeliveryResult,
  type AccountInviteListItem,
  type FriendshipInviteDeliveryResult,
  type FriendshipInviteListItem,
} from '@/lib/live-data';
import {
  buildAccountInviteShareMessage,
  buildAppInviteLink,
  buildFriendshipInviteShareMessage,
  buildFriendshipInviteLink,
  isAccountInviteDeliveryResult,
} from '@/features/invites/people-outreach-utils';
import { showGlobalFeedback } from '@/lib/global-feedback';
import {
  triggerIdentityErrorHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';

type InviteRequestMessageSetter = (message: string) => void;

async function shareFriendshipInviteDelivery(
  alias: string,
  delivery: FriendshipInviteDeliveryResult,
  setMessage: InviteRequestMessageSetter,
) {
  const inviteLink = buildFriendshipInviteLink(delivery.deliveryToken);
  const shareMessage = buildFriendshipInviteShareMessage({
    inviteLink,
    inviteeAlias: alias,
  });

  setMessage(`Invitación lista para ${alias}. Elige cómo enviarla.`);

  try {
    const result = await Share.share({
      message: shareMessage,
      title: 'Invitación a Happy Circles',
    });

    if (result.action === Share.dismissedAction) {
      setMessage(`Invitación lista para ${alias}. Si no la enviaste, toca Reenviar.`);
      showGlobalFeedback({
        message: `Puedes reenviarla a ${alias}.`,
        title: 'Invitación lista',
        tone: 'neutral',
      });
      return;
    }

    setMessage(`Invitación reenviada a ${alias}.`);
    showGlobalFeedback({
      message: `Pendiente de respuesta con ${alias}.`,
      title: 'Invitación reenviada',
      tone: 'success',
    });
  } catch {
    await Clipboard.setStringAsync(inviteLink);
    setMessage(`No pudimos abrir compartir. Copiamos el enlace de ${alias}.`);
    showGlobalFeedback({
      message: `Pégalo para enviarlo a ${alias}.`,
      title: 'Enlace copiado',
      tone: 'neutral',
    });
  }
}

async function shareAccountInviteDelivery(
  alias: string,
  delivery: AccountInviteDeliveryResult,
  setMessage: InviteRequestMessageSetter,
) {
  const inviteLink = buildAppInviteLink(delivery.deliveryToken);
  const shareMessage = buildAccountInviteShareMessage({
    amountMinor: null,
    description: null,
    direction: null,
    inviteLink,
    inviteeAlias: alias,
  });

  setMessage(`Acceso listo para ${alias}. Elige cómo enviarlo.`);

  try {
    const result = await Share.share({
      message: shareMessage,
      title: 'Invitación a Happy Circles',
    });

    if (result.action === Share.dismissedAction) {
      setMessage(`Acceso privado listo para ${alias}. Si no lo enviaste, toca Reenviar.`);
      showGlobalFeedback({
        message: `Puedes reenviarlo a ${alias}.`,
        title: 'Acceso listo',
        tone: 'neutral',
      });
      return;
    }

    setMessage(`Acceso privado reenviado a ${alias}.`);
    showGlobalFeedback({
      message: `Pendiente de abrir con ${alias}.`,
      title: 'Acceso reenviado',
      tone: 'success',
    });
  } catch {
    await Clipboard.setStringAsync(inviteLink);
    setMessage(`No pudimos abrir compartir. Copiamos el enlace privado de ${alias}.`);
    showGlobalFeedback({
      message: `Pégalo para enviarlo a ${alias}.`,
      title: 'Enlace copiado',
      tone: 'neutral',
    });
  }
}

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
  const createInternalInvite = useCreateInternalFriendshipInviteMutation();
  const createExternalInvite = useCreateExternalFriendshipInviteMutation();
  const createPeopleOutreach = useCreatePeopleOutreachMutation();
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

  const open = useCallback(
    (nextTab: InviteRequestsTab = preferredTab) => {
      setMessage(null);
      setActiveTab(nextTab);
      setVisible(true);
    },
    [preferredTab],
  );

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const handleAction = useCallback(
    async (item: InviteRequestItem, action: InviteRequestAction) => {
      const key = `${item.kind}:${item.inviteId}:${action}`;
      setBusyKey(key);
      setMessage(null);

      try {
        if (action === 'resend') {
          if (!canResendInviteRequest(item)) {
            throw new Error('Esta invitacion no se puede reenviar desde aqui.');
          }

          const fallbackAlias = displayNameForInvite(item);
          const sourceContext =
            item.actionState === 'history'
              ? 'invite_requests_resend_expired'
              : 'invite_requests_resend_pending';

          if (item.kind === 'friendship_invite') {
            if (item.flow === 'internal') {
              if (!item.profileUserId) {
                throw new Error('No encontramos la persona para reenviar esta solicitud.');
              }

              await createInternalInvite.mutateAsync({
                sourceContext,
                targetUserId: item.profileUserId,
              });
              triggerIdentitySuccessHaptic();
              setMessage(
                item.actionState === 'history'
                  ? `Solicitud enviada de nuevo a ${fallbackAlias}.`
                  : `Recordatorio enviado a ${fallbackAlias}.`,
              );
              showGlobalFeedback({
                message: `Para ${fallbackAlias}.`,
                title:
                  item.actionState === 'history' ? 'Solicitud reenviada' : 'Recordatorio enviado',
                tone: 'success',
              });
              return false;
            }

            if (
              item.originChannel !== 'remote' ||
              !item.intendedRecipientAlias ||
              !item.intendedRecipientPhoneE164
            ) {
              throw new Error('Esta invitacion necesita un contacto remoto para reenviarse.');
            }

            const alias = item.intendedRecipientAlias.trim() || fallbackAlias;
            const delivery = await createExternalInvite.mutateAsync({
              channel: 'remote',
              intendedRecipientAlias: alias,
              intendedRecipientPhoneE164: item.intendedRecipientPhoneE164,
              intendedRecipientPhoneLabel: item.intendedRecipientPhoneLabel ?? undefined,
              sourceContext,
            });
            triggerIdentitySuccessHaptic();
            await shareFriendshipInviteDelivery(alias, delivery, setMessage);
            return false;
          }

          if (
            item.originChannel !== 'remote' ||
            !item.intendedRecipientAlias ||
            !item.intendedRecipientPhoneE164
          ) {
            throw new Error('Esta invitacion necesita un contacto remoto para reenviarse.');
          }

          const alias = item.intendedRecipientAlias.trim() || fallbackAlias;
          const response = await createPeopleOutreach.mutateAsync({
            channel: 'remote',
            intendedRecipientAlias: alias,
            intendedRecipientPhoneE164: item.intendedRecipientPhoneE164,
            intendedRecipientPhoneLabel: item.intendedRecipientPhoneLabel ?? undefined,
            sourceContext,
          });
          triggerIdentitySuccessHaptic();

          if (response.kind === 'already_related') {
            setMessage(`${alias} ya aparece en tus personas.`);
            showGlobalFeedback({
              message: `Ya esta en tu lista de personas.`,
              title: alias,
              tone: 'neutral',
            });
            return false;
          }

          if (response.kind === 'friendship') {
            const nextMessage =
              response.status === 'pending_friendship'
                ? `${alias} ya tiene una solicitud pendiente.`
                : `Enviamos una solicitud de amistad a ${alias}.`;
            setMessage(nextMessage);
            showGlobalFeedback({
              message: nextMessage,
              title: 'Solicitud enviada',
              tone: 'success',
            });
            return false;
          }

          if (!isAccountInviteDeliveryResult(response.result)) {
            throw new Error('No pudimos preparar el enlace de acceso para este contacto.');
          }

          await shareAccountInviteDelivery(alias, response.result, setMessage);
          return false;
        }

        if (
          item.kind === 'friendship_invite' &&
          item.actionState === 'requires_you_response' &&
          (action === 'accept' || action === 'reject')
        ) {
          await respondInternalInvite.mutateAsync({
            inviteId: item.inviteId,
            decision: action === 'accept' ? 'accept' : 'reject',
          });
          if (action === 'accept') {
            triggerIdentitySuccessHaptic();
          } else {
            triggerIdentityWarningHaptic();
          }
          setMessage(action === 'accept' ? 'Invitación aceptada.' : 'Invitación rechazada.');
          return action === 'accept';
        }

        if (
          item.kind === 'friendship_invite' &&
          item.actionState === 'requires_you_review' &&
          (action === 'approve' || action === 'reject')
        ) {
          await reviewExternalInvite.mutateAsync({
            inviteId: item.inviteId,
            decision: action === 'approve' ? 'approve' : 'reject',
          });
          if (action === 'approve') {
            triggerIdentitySuccessHaptic();
          } else {
            triggerIdentityWarningHaptic();
          }
          setMessage(action === 'approve' ? 'Conexión confirmada.' : 'Invitación cerrada.');
          return action === 'approve';
        }

        if (
          item.kind === 'account_invite' &&
          item.actionState === 'requires_you_review' &&
          (action === 'approve' || action === 'reject')
        ) {
          await reviewAccountInvite.mutateAsync({
            inviteId: item.inviteId,
            decision: action === 'approve' ? 'approve' : 'reject',
          });
          if (action === 'approve') {
            triggerIdentitySuccessHaptic();
          } else {
            triggerIdentityWarningHaptic();
          }
          setMessage(action === 'approve' ? 'Acceso confirmado.' : 'Invitación de acceso cerrada.');
          return action === 'approve';
        }

        if (
          item.kind === 'friendship_invite' &&
          (item.actionState === 'pending_claim' || item.actionState === 'waiting_other_side') &&
          action === 'cancel'
        ) {
          await cancelFriendshipInvite.mutateAsync(item.inviteId);
          triggerIdentityWarningHaptic();
          setMessage('Invitación cancelada.');
          return false;
        }

        if (
          item.kind === 'account_invite' &&
          item.actionState === 'pending_activation' &&
          !item.activatedUserId &&
          action === 'cancel'
        ) {
          await cancelAccountInvite.mutateAsync(item.inviteId);
          triggerIdentityWarningHaptic();
          setMessage('Invitación de acceso cancelada.');
        }
        return false;
      } catch (error) {
        triggerIdentityErrorHaptic();
        setMessage(error instanceof Error ? error.message : 'No se pudo completar la acción.');
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [
      cancelAccountInvite,
      cancelFriendshipInvite,
      createExternalInvite,
      createInternalInvite,
      createPeopleOutreach,
      respondInternalInvite,
      reviewAccountInvite,
      reviewExternalInvite,
    ],
  );

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
