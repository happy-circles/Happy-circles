import { useCallback, useMemo, useRef, useState } from 'react';
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
  useRemindFriendshipInviteMutation,
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
import { inviteActionResult } from './invite-action-result';
import {
  assertAccountDeliveryCurrent,
  assertFriendshipDeliveryCurrent,
} from '@/features/invites/invite-delivery-validation';
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
  await assertFriendshipDeliveryCurrent(delivery);
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

    setMessage(`Enlace listo para compartir con ${alias}.`);
    showGlobalFeedback({
      message: `Pendiente de respuesta con ${alias}.`,
      title: 'Enlace preparado',
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
  await assertAccountDeliveryCurrent(delivery);
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

    setMessage(`Acceso privado listo para compartir con ${alias}.`);
    showGlobalFeedback({
      message: `Pendiente de abrir con ${alias}.`,
      title: 'Acceso preparado',
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
  const remindInvite = useRemindFriendshipInviteMutation();
  const createExternalInvite = useCreateExternalFriendshipInviteMutation();
  const createPeopleOutreach = useCreatePeopleOutreachMutation();
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<InviteRequestsTab>('received');
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const actionInFlight = useRef(false);
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
      if (actionInFlight.current) return false;
      actionInFlight.current = true;
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

              const response =
                item.actionState === 'history'
                  ? await createInternalInvite.mutateAsync({
                      sourceContext,
                      targetUserId: item.profileUserId,
                    })
                  : await remindInvite.mutateAsync(item.inviteId);
              triggerIdentitySuccessHaptic();
              const nextMessage =
                response.status === 'accepted'
                  ? `${fallbackAlias} ya aparece en tus personas.`
                  : response.reminderStatus === 'cooldown'
                    ? 'Ya solicitaste un recordatorio recientemente. Podrás solicitar otro en un minuto.'
                    : response.reminderStatus === 'resolved'
                      ? 'La solicitud ya cambió de estado. Actualizamos la lista.'
                      : item.actionState === 'history'
                        ? `Solicitud enviada de nuevo a ${fallbackAlias}.`
                        : `Recordatorio solicitado para ${fallbackAlias}.`;
              setMessage(nextMessage);
              showGlobalFeedback({
                message: nextMessage,
                title: item.actionState === 'history' ? 'Solicitud actualizada' : 'Recordatorio',
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
          const response = await respondInternalInvite.mutateAsync({
            inviteId: item.inviteId,
            decision: action === 'accept' ? 'accept' : 'reject',
          });
          const outcome = inviteActionResult(response.status);
          if (outcome.connected) {
            triggerIdentitySuccessHaptic();
          } else {
            triggerIdentityWarningHaptic();
          }
          setMessage(outcome.message);
          return outcome.connected;
        }

        if (
          item.kind === 'friendship_invite' &&
          item.actionState === 'requires_you_review' &&
          (action === 'approve' || action === 'reject')
        ) {
          const response = await reviewExternalInvite.mutateAsync({
            inviteId: item.inviteId,
            decision: action === 'approve' ? 'approve' : 'reject',
          });
          const outcome = inviteActionResult(response.status);
          if (outcome.connected) {
            triggerIdentitySuccessHaptic();
          } else {
            triggerIdentityWarningHaptic();
          }
          setMessage(outcome.message);
          return outcome.connected;
        }

        if (
          item.kind === 'account_invite' &&
          item.actionState === 'requires_you_review' &&
          (action === 'approve' || action === 'reject')
        ) {
          const response = await reviewAccountInvite.mutateAsync({
            inviteId: item.inviteId,
            decision: action === 'approve' ? 'approve' : 'reject',
          });
          const outcome = inviteActionResult(response.status, 'account');
          if (outcome.connected) {
            triggerIdentitySuccessHaptic();
          } else {
            triggerIdentityWarningHaptic();
          }
          setMessage(outcome.message);
          return outcome.connected;
        }

        if (
          item.kind === 'friendship_invite' &&
          (item.actionState === 'pending_claim' || item.actionState === 'waiting_other_side') &&
          action === 'cancel'
        ) {
          const response = await cancelFriendshipInvite.mutateAsync(item.inviteId);
          triggerIdentityWarningHaptic();
          setMessage(
            response.status === 'accepted'
              ? 'La invitación ya fue aceptada. La amistad sigue activa.'
              : response.status === 'canceled'
                ? 'Invitación cancelada.'
                : 'La invitación ya cambió de estado. Actualizamos la lista.',
          );
          return false;
        }

        if (
          item.kind === 'account_invite' &&
          item.actionState === 'pending_activation' &&
          !item.activatedUserId &&
          action === 'cancel'
        ) {
          const response = await cancelAccountInvite.mutateAsync(item.inviteId);
          triggerIdentityWarningHaptic();
          setMessage(
            response.status === 'canceled'
              ? 'Invitación de acceso cancelada.'
              : 'El acceso ya cambió de estado. Actualizamos la lista.',
          );
        }
        return false;
      } catch (error) {
        triggerIdentityErrorHaptic();
        setMessage(error instanceof Error ? error.message : 'No se pudo completar la acción.');
        return false;
      } finally {
        actionInFlight.current = false;
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
      remindInvite,
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
