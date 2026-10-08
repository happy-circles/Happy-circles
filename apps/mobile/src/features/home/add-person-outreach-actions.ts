import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import * as Clipboard from 'expo-clipboard';
import type { Router } from 'expo-router';
import { Share } from 'react-native';

import type { ContactActionFeedbackMode } from '@/components/contact-action-feedback-overlay';
import {
  compareEnrichedContacts,
  type AddPersonTransactionContext,
  type EnrichedContact,
} from '@/features/home/contacts-sheet-helpers';
import {
  buildAccountInviteShareMessage,
  buildAppInviteLink,
  isAccountInviteDeliveryResult,
  type ContactCandidate,
  type PendingContactSelection,
} from '@/features/invites/people-outreach-utils';
import { showBlockedActionAlert, type ActionFeedbackVariant } from '@/lib/action-feedback';
import { showGlobalFeedback } from '@/lib/global-feedback';
import { pushRoute } from '@/lib/navigation';
import { assertAccountDeliveryCurrent } from '@/features/invites/invite-delivery-validation';
import { rememberImmediateInviteRequest } from '@/features/people/immediate-invite-request';
import {
  contactResolutionForOutreach,
  friendshipOutreachOutcome,
} from '@/lib/live-data/mutations/people-outreach-confirmation';
import { useSession } from '@/providers/session-provider';
import { readContactResolutions } from '@/lib/contact-resolution-state';
import type {
  AccountInviteDeliveryResult,
  PeopleOutreachResult,
  PeopleTargetResolution,
} from '@/lib/live-data';

type CreatePeopleOutreachMutation = {
  readonly mutateAsync: (input: {
    readonly channel: 'remote';
    readonly intendedRecipientAlias: string;
    readonly intendedRecipientPhoneE164: string;
    readonly intendedRecipientPhoneLabel?: string;
    readonly sourceContext: string;
  }) => Promise<PeopleOutreachResult>;
};

export interface AddPersonContactActionFeedback {
  readonly alias: string;
  readonly message?: string;
  readonly mode: ContactActionFeedbackMode;
  readonly title?: string;
  readonly variant: ActionFeedbackVariant;
}

export function useAddPersonOutreachActions({
  onClose,
  busyKey,
  createPeopleOutreach,
  router,
  setBusyKey,
  setMessage,
  targetCache,
  transactionContext,
}: {
  readonly onClose: () => void;
  readonly busyKey: string | null;
  readonly createPeopleOutreach: CreatePeopleOutreachMutation;
  readonly ensurePhoneStatuses: (phoneE164List: readonly string[]) => Promise<void>;
  readonly resolvePhoneStatusesNow: (
    phoneE164List: readonly string[],
  ) => Promise<readonly PeopleTargetResolution[]>;
  readonly router: Router;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
  readonly targetCache: Readonly<Record<string, PeopleTargetResolution>>;
  readonly transactionContext?: AddPersonTransactionContext | null;
}) {
  const { userId } = useSession();
  const [pendingContactSelection, setPendingContactSelection] =
    useState<PendingContactSelection | null>(null);
  const [contactActionFeedback, setContactActionFeedback] =
    useState<AddPersonContactActionFeedback | null>(null);
  const actionInFlightRef = useRef(false);

  const pendingContactOptions = useMemo<readonly EnrichedContact[]>(
    () =>
      pendingContactSelection
        ? pendingContactSelection.phoneOptions
            .map((phoneOption) => ({
              contact: {
                alias: pendingContactSelection.alias,
                contactId: pendingContactSelection.contactId,
                phoneOptions: [phoneOption],
                primaryPhone: phoneOption,
                searchKey: '',
              },
              resolution: targetCache[phoneOption.phoneE164] ?? null,
            }))
            .sort(compareEnrichedContacts)
        : [],
    [pendingContactSelection, targetCache],
  );

  const hideContactActionFeedback = useCallback(() => {
    setContactActionFeedback(null);
  }, []);

  const showContactActionLoading = useCallback(
    (input: {
      readonly alias: string;
      readonly message?: string;
      readonly mode?: ContactActionFeedbackMode;
      readonly title?: string;
    }) => {
      setContactActionFeedback({
        alias: input.alias,
        message: input.message,
        mode: input.mode ?? 'prepare',
        title: input.title,
        variant: 'loading',
      });
    },
    [],
  );

  const resetPendingContactSelection = useCallback(() => {
    setPendingContactSelection(null);
  }, []);

  async function shareAccountInviteLink(alias: string, delivery: AccountInviteDeliveryResult) {
    await assertAccountDeliveryCurrent(delivery);
    const inviteLink = buildAppInviteLink(delivery.deliveryToken);
    const shareMessage = buildAccountInviteShareMessage({
      amountMinor: transactionContext?.amountMinor ?? null,
      description: transactionContext?.description ?? null,
      direction: transactionContext?.direction ?? null,
      inviteLink,
      inviteeAlias: alias,
    });

    setMessage(`Acceso listo para ${alias}. Elige cómo enviarlo.`);
    showContactActionLoading({
      alias,
      message: 'Tu telefono esta abriendo las opciones para enviar el acceso.',
      mode: 'share',
      title: 'Abriendo compartir',
    });

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

      setMessage(
        `Acceso privado listo para ${alias}. Quedó en Enviadas como "Pendiente de abrir".`,
      );
      showGlobalFeedback({
        message: `Pendiente de abrir con ${alias}.`,
        title: 'Acceso privado listo',
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

  function openPendingRequest(
    resolution: PeopleTargetResolution,
    input: { readonly alias: string; readonly phoneLabel?: string | null },
  ) {
    const requestId = resolution.friendshipInviteId ?? resolution.accountInviteId;
    if (!requestId) return false;
    if (userId) rememberImmediateInviteRequest(userId, resolution, input);
    hideContactActionFeedback();
    onClose();
    pushRoute(router, {
      pathname: '/people',
      params: {
        requests: '1',
        requestId,
        requestTab: resolution.friendshipDirection === 'incoming' ? 'received' : 'sent',
      },
    });
    return true;
  }

  async function handleCreateOutreach(input: {
    readonly alias: string;
    readonly phoneE164: string;
    readonly phoneLabel?: string | null;
    readonly sourceContext: string;
  }) {
    if (busyKey || actionInFlightRef.current) {
      return;
    }

    const cached =
      (userId ? readContactResolutions(userId)[input.phoneE164] : undefined) ??
      targetCache[input.phoneE164];
    if (cached?.status === 'pending_friendship' && openPendingRequest(cached, input)) return;

    actionInFlightRef.current = true;
    setBusyKey(input.phoneE164);
    setMessage(`Enviando invitación a ${input.alias}.`);

    try {
      const response = await createPeopleOutreach.mutateAsync({
        channel: 'remote',
        intendedRecipientAlias: input.alias,
        intendedRecipientPhoneE164: input.phoneE164,
        intendedRecipientPhoneLabel: input.phoneLabel ?? undefined,
        sourceContext: input.sourceContext,
      });

      if (response.kind === 'already_related') {
        setMessage(`${input.alias} ya aparece en tus personas.`);
        showGlobalFeedback({
          message: 'Ya estaba en tu lista de personas.',
          title: 'Persona encontrada',
          tone: 'neutral',
        });
        return;
      }

      if (response.kind === 'friendship') {
        const outcome = friendshipOutreachOutcome(response);
        const latest = userId ? readContactResolutions(userId)[input.phoneE164] : undefined;
        if (latest?.resolvedAt && latest.friendshipInviteId !== outcome.inviteId) {
          const nextMessage =
            latest.status === 'already_related'
              ? `${input.alias} ya aparece en tus personas.`
              : 'La solicitud ya cambió de estado. La información del contacto está actualizada.';
          setMessage(nextMessage);
          showGlobalFeedback({
            message: nextMessage,
            title: 'Contacto actualizado',
            tone: 'neutral',
          });
          if (latest.status === 'pending_friendship') openPendingRequest(latest, input);
          return;
        }
        const nextMessage =
          outcome.direction === 'incoming'
            ? `${input.alias} ya te envió una solicitud. Puedes responderla.`
            : outcome.created
              ? `Enviamos una solicitud de amistad a ${input.alias}.`
              : `Ya tienes una solicitud pendiente con ${input.alias}.`;
        setMessage(nextMessage);
        showGlobalFeedback({
          message: nextMessage,
          title:
            outcome.created && outcome.direction !== 'incoming'
              ? 'Solicitud enviada'
              : 'Solicitud pendiente',
          tone: outcome.created && outcome.direction !== 'incoming' ? 'success' : 'neutral',
        });
        if (!outcome.created || outcome.direction === 'incoming') {
          openPendingRequest(
            contactResolutionForOutreach(input.phoneE164, response, cached),
            input,
          );
        }
        return;
      }

      if (!isAccountInviteDeliveryResult(response.result)) {
        throw new Error('No pudimos preparar el enlace de acceso para este contacto.');
      }

      await shareAccountInviteLink(input.alias, response.result);
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo completar este movimiento.';
      setMessage(failureMessage);
      showBlockedActionAlert(failureMessage, router);
    } finally {
      actionInFlightRef.current = false;
      hideContactActionFeedback();
      setBusyKey(null);
    }
  }

  async function handleContactPress(contact: ContactCandidate) {
    if (busyKey || actionInFlightRef.current) {
      return;
    }

    if (contact.phoneOptions.length === 1) {
      await handleCreateOutreach({
        alias: contact.alias,
        phoneE164: contact.primaryPhone.phoneE164,
        phoneLabel: contact.primaryPhone.label,
        sourceContext: 'home_add_contact_list',
      });
      return;
    }

    setPendingContactSelection({
      alias: contact.alias,
      contactId: contact.contactId,
      phoneOptions: contact.phoneOptions,
    });
  }

  return {
    contactActionFeedback,
    handleContactPress,
    handleCreateOutreach,
    pendingContactOptions,
    pendingContactSelection,
    resetPendingContactSelection,
    setPendingContactSelection,
  };
}
