import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import * as Clipboard from 'expo-clipboard';
import type { Router } from 'expo-router';
import { Alert, Share } from 'react-native';

import type { ContactActionFeedbackMode } from '@/components/contact-action-feedback-overlay';
import {
  compareEnrichedContacts,
  outreachPreflightActionForResolution,
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
  busyKey,
  createPeopleOutreach,
  ensurePhoneStatuses,
  mergeAndPersistTargetResolutions,
  resolvePhoneStatusesNow,
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
  readonly resolvePhoneStatusesNow: (
    phoneE164List: readonly string[],
  ) => Promise<readonly PeopleTargetResolution[]>;
  readonly router: Router;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
  readonly targetCache: Readonly<Record<string, PeopleTargetResolution>>;
  readonly transactionContext?: AddPersonTransactionContext | null;
}) {
  const [pendingContactSelection, setPendingContactSelection] =
    useState<PendingContactSelection | null>(null);
  const [contactActionFeedback, setContactActionFeedback] =
    useState<AddPersonContactActionFeedback | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackResolveRef = useRef<(() => void) | null>(null);

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

  const clearFeedbackTimeout = useCallback(() => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }

    if (feedbackResolveRef.current) {
      feedbackResolveRef.current();
      feedbackResolveRef.current = null;
    }
  }, []);

  useEffect(() => () => clearFeedbackTimeout(), [clearFeedbackTimeout]);

  const hideContactActionFeedback = useCallback(() => {
    clearFeedbackTimeout();
    setContactActionFeedback(null);
  }, [clearFeedbackTimeout]);

  const showContactActionLoading = useCallback(
    (input: {
      readonly alias: string;
      readonly message?: string;
      readonly mode?: ContactActionFeedbackMode;
      readonly title?: string;
    }) => {
      clearFeedbackTimeout();
      setContactActionFeedback({
        alias: input.alias,
        message: input.message,
        mode: input.mode ?? 'prepare',
        title: input.title,
        variant: 'loading',
      });
    },
    [clearFeedbackTimeout],
  );

  const showContactActionResult = useCallback(
    (input: {
      readonly alias: string;
      readonly durationMs?: number;
      readonly message?: string;
      readonly mode?: ContactActionFeedbackMode;
      readonly title: string;
      readonly variant?: Exclude<ActionFeedbackVariant, 'loading'>;
    }) => {
      clearFeedbackTimeout();
      const variant = input.variant ?? 'success';
      setContactActionFeedback({
        alias: input.alias,
        message: input.message,
        mode: input.mode ?? 'prepare',
        title: input.title,
        variant,
      });

      return new Promise<void>((resolve) => {
        feedbackResolveRef.current = resolve;
        feedbackTimeoutRef.current = setTimeout(
          () => {
            setContactActionFeedback(null);
            feedbackTimeoutRef.current = null;
            feedbackResolveRef.current = null;
            resolve();
          },
          input.durationMs ?? (variant === 'danger' ? 1900 : 950),
        );
      });
    },
    [clearFeedbackTimeout],
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

  function confirmHappyCirclesFriendship(alias: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      Alert.alert(
        'Esta en Happy Circles',
        `${alias} ya usa Happy Circles. Quieres enviarle una solicitud de amistad?`,
        [
          {
            onPress: () => settle(false),
            style: 'cancel',
            text: 'Cancelar',
          },
          {
            onPress: () => settle(true),
            text: 'Enviar solicitud',
          },
        ],
        {
          cancelable: true,
          onDismiss: () => settle(false),
        },
      );
    });
  }

  async function runOutreachPreflight(input: {
    readonly alias: string;
    readonly phoneE164: string;
  }): Promise<boolean> {
    showContactActionLoading({
      alias: input.alias,
      message: 'Antes de invitar, revisamos si ya esta en Happy Circles.',
      mode: 'prepare',
      title: 'Revisando contacto',
    });

    const resolutions = await resolvePhoneStatusesNow([input.phoneE164]);
    const resolution =
      resolutions.find((item) => item.phoneE164 === input.phoneE164) ??
      targetCache[input.phoneE164] ??
      null;

    if (!resolution) {
      throw new Error('No pudimos confirmar si este numero esta en Happy Circles.');
    }

    const action = outreachPreflightActionForResolution(resolution);

    if (action === 'block_already_related') {
      setMessage(`${input.alias} ya aparece en tus personas.`);
      await showContactActionResult({
        alias: input.alias,
        message: 'Ya estaba en tu lista de personas.',
        title: 'Persona encontrada',
      });
      return false;
    }

    if (action === 'block_pending_friendship') {
      setMessage(`${input.alias} ya tiene una solicitud pendiente.`);
      await showContactActionResult({
        alias: input.alias,
        message: 'No enviamos otra solicitud para el mismo contacto.',
        title: 'Solicitud pendiente',
      });
      return false;
    }

    if (action === 'confirm_friendship') {
      hideContactActionFeedback();
      const confirmed = await confirmHappyCirclesFriendship(input.alias);
      if (!confirmed) {
        setMessage(`No enviamos solicitud a ${input.alias}.`);
        return false;
      }

      showContactActionLoading({
        alias: input.alias,
        message: 'Preparando la solicitud de amistad.',
        mode: 'prepare',
        title: 'Preparando solicitud',
      });
    }

    return true;
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
    setMessage(`Preparando invitación para ${input.alias}.`);
    showContactActionLoading({
      alias: input.alias,
      message: 'Estamos revisando el numero y preparando la accion correcta.',
      mode: 'prepare',
      title: 'Preparando contacto',
    });

    try {
      const shouldContinue = await runOutreachPreflight({
        alias: input.alias,
        phoneE164: input.phoneE164,
      });
      if (!shouldContinue) {
        return;
      }

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
        await showContactActionResult({
          alias: input.alias,
          message: 'Ya estaba en tu lista de personas.',
          title: 'Persona encontrada',
        });
        return;
      }

      if (response.kind === 'friendship') {
        const nextMessage =
          response.status === 'pending_friendship'
            ? `${input.alias} ya tiene una solicitud pendiente.`
            : `Enviamos una solicitud de amistad a ${input.alias}.`;
        setMessage(nextMessage);

        if (response.status !== 'pending_friendship') {
          showGlobalFeedback({
            message: `A ${input.alias}.`,
            title: 'Solicitud enviada',
            tone: 'success',
          });
        }
        await showContactActionResult({
          alias: input.alias,
          message: nextMessage,
          title:
            response.status === 'pending_friendship' ? 'Solicitud pendiente' : 'Solicitud enviada',
        });
        return;
      }

      if (!isAccountInviteDeliveryResult(response.result)) {
        throw new Error('No pudimos preparar el enlace de acceso para este contacto.');
      }

      await shareAccountInviteLink(input.alias, response.result);
      await showContactActionResult({
        alias: input.alias,
        message: 'El acceso privado quedo listo para enviar o reenviar.',
        mode: 'share',
        title: 'Acceso listo',
      });
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo completar este movimiento.';
      setMessage(failureMessage);
      await showContactActionResult({
        alias: input.alias,
        message: failureMessage,
        title: 'No se pudo completar',
        variant: 'danger',
      });
      showBlockedActionAlert(failureMessage, router);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleContactPress(contact: ContactCandidate) {
    if (busyKey) {
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

    void ensurePhoneStatuses(
      contact.phoneOptions.map((phoneOption) => phoneOption.phoneE164),
    ).catch((error) => {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo revisar los numeros de este contacto.',
      );
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
