import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import * as Clipboard from 'expo-clipboard';
import type { Router } from 'expo-router';
import { Share } from 'react-native';

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
import { showBlockedActionAlert } from '@/lib/action-feedback';
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

export function useAddPersonOutreachActions({
  busyKey,
  createPeopleOutreach,
  ensurePhoneStatuses,
  mergeAndPersistTargetResolutions,
  router,
  setBusyKey,
  setMessage,
  targetCache,
  transactionContext,
}: {
  readonly busyKey: string | null;
  readonly createPeopleOutreach: CreatePeopleOutreachMutation;
  readonly ensurePhoneStatuses: (phoneE164List: readonly string[]) => Promise<void>;
  readonly mergeAndPersistTargetResolutions: (
    resolutions: readonly PeopleTargetResolution[],
  ) => void;
  readonly router: Router;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
  readonly targetCache: Readonly<Record<string, PeopleTargetResolution>>;
  readonly transactionContext?: AddPersonTransactionContext | null;
}) {
  const [pendingContactSelection, setPendingContactSelection] =
    useState<PendingContactSelection | null>(null);

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

  const resetPendingContactSelection = useCallback(() => {
    setPendingContactSelection(null);
  }, []);

  async function shareAccountInviteLink(alias: string, delivery: AccountInviteDeliveryResult) {
    const inviteLink = buildAppInviteLink(delivery.deliveryToken);
    const shareMessage = buildAccountInviteShareMessage({
      amountMinor: transactionContext?.amountMinor ?? null,
      description: transactionContext?.description ?? null,
      direction: transactionContext?.direction ?? null,
      inviteLink,
      inviteeAlias: alias,
    });

    try {
      await Share.share({
        message: shareMessage,
        title: 'Invitacion a Happy Circles',
      });
      setMessage(`Listo. Ya puedes compartir el acceso privado con ${alias}.`);
    } catch {
      await Clipboard.setStringAsync(inviteLink);
      setMessage(`No pudimos abrir compartir. Copiamos el link privado de ${alias}.`);
    }
  }

  function updateCacheFromOutreach(
    phoneE164: string,
    alias: string,
    response: PeopleOutreachResult,
  ) {
    let resolution: PeopleTargetResolution;

    if (response.kind === 'already_related') {
      resolution = {
        accountInviteId: null,
        accountInviteStatus: null,
        avatarPath: null,
        displayName: response.displayName ?? alias,
        friendshipInviteId: null,
        matchedUserId: response.matchedUserId,
        phoneE164,
        relationshipId: response.relationshipId ?? null,
        status: 'already_related',
      };
      mergeAndPersistTargetResolutions([resolution]);
      return;
    }

    if (response.kind === 'friendship') {
      resolution = {
        accountInviteId: null,
        accountInviteStatus: null,
        avatarPath: null,
        displayName: response.displayName ?? alias,
        friendshipInviteId: response.inviteId ?? null,
        matchedUserId: response.matchedUserId,
        phoneE164,
        relationshipId: response.relationshipId ?? null,
        status: 'pending_friendship',
      };
      mergeAndPersistTargetResolutions([resolution]);
      return;
    }

    const accountInviteId =
      isAccountInviteDeliveryResult(response.result) && typeof response.result.inviteId === 'string'
        ? response.result.inviteId
        : (response.inviteId ?? null);

    resolution = {
      accountInviteId,
      accountInviteStatus: 'pending_activation',
      avatarPath: null,
      displayName: response.displayName ?? alias,
      friendshipInviteId: null,
      matchedUserId: response.matchedUserId,
      phoneE164,
      relationshipId: null,
      status: 'pending_activation',
    };
    mergeAndPersistTargetResolutions([resolution]);
  }

  async function handleCreateOutreach(input: {
    readonly alias: string;
    readonly phoneE164: string;
    readonly phoneLabel?: string | null;
    readonly sourceContext: string;
  }) {
    if (busyKey) {
      return;
    }

    setBusyKey(input.phoneE164);
    setMessage(null);

    try {
      const response = await createPeopleOutreach.mutateAsync({
        channel: 'remote',
        intendedRecipientAlias: input.alias,
        intendedRecipientPhoneE164: input.phoneE164,
        intendedRecipientPhoneLabel: input.phoneLabel ?? undefined,
        sourceContext: input.sourceContext,
      });

      updateCacheFromOutreach(input.phoneE164, input.alias, response);

      if (response.kind === 'already_related') {
        setMessage(`${input.alias} ya aparece en tus personas.`);
        return;
      }

      if (response.kind === 'friendship') {
        setMessage(
          response.status === 'pending_friendship'
            ? `${input.alias} ya tiene una solicitud pendiente.`
            : `Enviamos una solicitud de amistad a ${input.alias}.`,
        );
        return;
      }

      if (!isAccountInviteDeliveryResult(response.result)) {
        throw new Error('No pudimos preparar el link de acceso para este contacto.');
      }

      await shareAccountInviteLink(input.alias, response.result);
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo completar este movimiento.';
      setMessage(failureMessage);
      showBlockedActionAlert(failureMessage, router);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleContactPress(contact: ContactCandidate) {
    if (contact.phoneOptions.length === 1) {
      await handleCreateOutreach({
        alias: contact.alias,
        phoneE164: contact.primaryPhone.phoneE164,
        phoneLabel: contact.primaryPhone.label,
        sourceContext: 'home_add_contact_list',
      });
      return;
    }

    try {
      await ensurePhoneStatuses(contact.phoneOptions.map((phoneOption) => phoneOption.phoneE164));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo revisar los numeros de este contacto.',
      );
    }

    setPendingContactSelection({
      alias: contact.alias,
      contactId: contact.contactId,
      phoneOptions: contact.phoneOptions,
    });
  }

  return {
    handleContactPress,
    handleCreateOutreach,
    pendingContactOptions,
    pendingContactSelection,
    resetPendingContactSelection,
    setPendingContactSelection,
  };
}
