import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowPrimaryAction,
  IdentityFlowSecondaryAction,
  IdentityFlowScreen,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import type { BrandVerificationState } from '@/components/brand-verification-lockup';
import { clearPendingInviteIntent, writePendingInviteIntent } from '@/lib/invite-intent';
import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import { returnToRoute } from '@/lib/navigation';
import {
  buildSetupAccountHref,
  isLowQualityDisplayName,
  type SetupStep,
} from '@/lib/setup-account';
import {
  useAccountInvitePreviewQuery,
  useActivateAccountFromInviteMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type IoniconName = ComponentProps<typeof IdentityFlowField>['icon'];

function inviteReasonLabel(reason: string): string {
  if (reason === 'invite_unavailable') {
    return 'Esta invitacion no esta disponible o ya no puede usarse.';
  }

  if (reason === 'delivery_revoked') {
    return 'Este acceso fue reemplazado por un link mas reciente.';
  }

  if (reason === 'delivery_expired' || reason === 'expired') {
    return 'Esta invitacion ya vencio.';
  }

  if (reason === 'pending_inviter_review') {
    return 'Tu cuenta ya quedo activa. Solo falta que la persona que te invito confirme el contacto.';
  }

  if (reason === 'accepted') {
    return 'La cuenta ya quedo activa y la conexion fue creada.';
  }

  if (reason === 'rejected') {
    return 'La invitacion fue cerrada despues de revisar el contacto.';
  }

  if (reason === 'canceled') {
    return 'La invitacion fue cancelada.';
  }

  return 'Necesitas terminar la activacion para entrar a Happy Circles.';
}

function channelLabel(channel: 'remote' | 'qr') {
  return channel === 'qr' ? 'QR temporal' : 'Invitacion privada';
}

function joinReadableList(items: readonly string[]) {
  if (items.length <= 1) {
    return items[0] ?? '';
  }

  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function setupRequirementLabel(step: SetupStep) {
  if (step === 'email') {
    return 'confirmar tu correo';
  }

  if (step === 'security') {
    return 'validar este telefono';
  }

  return 'completar nombre y celular';
}

function profileRequirementLabel(profile: ReturnType<typeof useSession>['profile']) {
  const missingName = isLowQualityDisplayName(profile?.display_name);
  const missingPhone = !profile?.phone_e164;

  if (missingName && missingPhone) {
    return 'completar nombre y celular';
  }

  if (missingName) {
    return 'completar nombre';
  }

  if (missingPhone) {
    return 'completar celular';
  }

  return 'completar perfil';
}

function setupActionLabel(step: SetupStep) {
  if (step === 'email') {
    return 'Confirmar correo';
  }

  if (step === 'security') {
    return 'Confiar este telefono';
  }

  return 'Completar perfil';
}

function setupActionSubtitle(
  steps: readonly SetupStep[],
  profile: ReturnType<typeof useSession>['profile'],
) {
  if (steps.length === 0) {
    return 'Termina el setup requerido antes de activar la cuenta.';
  }

  return `Falta ${joinReadableList(
    steps.map((step) =>
      step === 'profile' ? profileRequirementLabel(profile) : setupRequirementLabel(step),
    ),
  )} antes de activar la cuenta.`;
}

function isUnavailableAccountInvite(preview: {
  readonly deliveryStatus: string;
  readonly reason: string;
  readonly status: string;
}) {
  return (
    ['revoked', 'expired'].includes(preview.deliveryStatus) ||
    ['canceled', 'rejected', 'unavailable'].includes(preview.status) ||
    [
      'canceled',
      'delivery_expired',
      'delivery_revoked',
      'expired',
      'invite_unavailable',
      'rejected',
    ].includes(preview.reason)
  );
}

function ActivationDetailRow({
  icon,
  subtitle,
  title,
}: {
  readonly icon: IoniconName;
  readonly subtitle?: string | null;
  readonly title: string;
}) {
  return (
    <IdentityFlowField icon={icon} label={title} reserveError={false}>
      <View style={styles.detailValue}>
        <Text style={styles.detailTitle}>{title}</Text>
        {subtitle ? <Text style={styles.detailSubtitle}>{subtitle}</Text> : null}
      </View>
    </IdentityFlowField>
  );
}

export function AccountInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const session = useSession();
  const activateInvite = useActivateAccountFromInviteMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'activate' | null>(null);
  const refreshAccountState = session.refreshAccountState;
  const sessionStatus = session.status;

  const deliveryToken = useMemo(
    () =>
      typeof params.token === 'string' && params.token.trim().length > 0
        ? params.token.trim()
        : null,
    [params.token],
  );
  const previewQuery = useAccountInvitePreviewQuery(deliveryToken);
  const preview = previewQuery.data;

  const canActivate = preview
    ? Boolean(deliveryToken) &&
      session.status !== 'loading' &&
      session.status !== 'signed_out' &&
      session.accountAccessState !== 'active' &&
      preview.status === 'pending_activation' &&
      preview.deliveryStatus !== 'revoked' &&
      preview.deliveryStatus !== 'expired'
    : false;
  const needsSetup = !session.setupState.requiredComplete;
  const nextSetupStep = session.setupState.pendingRequiredSteps[0] ?? 'profile';
  const needsTrustedDevice = session.deviceTrustState !== 'trusted';
  const setupBlockerLabel = setupActionLabel(nextSetupStep);
  const setupBlockerSubtitle = setupActionSubtitle(
    session.setupState.pendingRequiredSteps,
    session.profile,
  );
  const tokenUnavailable = preview ? isUnavailableAccountInvite(preview) : false;
  const hasPreviewDetails = Boolean(
    preview && !tokenUnavailable && preview.channel && preview.expiresAt,
  );
  const tokenState: BrandVerificationState =
    !deliveryToken || previewQuery.error
      ? 'error'
      : previewQuery.isLoading
        ? 'loading'
        : preview
          ? tokenUnavailable
            ? 'error'
            : 'success'
          : 'idle';
  const tokenTitle = !deliveryToken
    ? 'Link invalido'
    : previewQuery.error
      ? 'No pudimos abrir este acceso'
      : previewQuery.isLoading
        ? 'Leyendo invitacion'
        : preview
          ? tokenUnavailable
            ? 'Invitacion no disponible'
            : canActivate
              ? 'Activa tu cuenta'
              : 'Invitacion confirmada'
          : 'Entrar con invitacion';
  const tokenSubtitle = !deliveryToken
    ? 'No encontramos el token de esta invitacion.'
    : previewQuery.error
      ? previewQuery.error.message
      : previewQuery.isLoading
        ? 'Confirmando si este acceso sigue disponible.'
        : preview
          ? tokenUnavailable
            ? 'No revelamos detalles de invitaciones no disponibles.'
            : `${preview.inviterDisplayName ?? 'Alguien'} envio este acceso privado.`
          : 'Una invitacion privada te da acceso a Happy Circles.';
  const contentTransitionKey = previewQuery.isLoading
    ? 'account-invite:loading'
    : preview
      ? 'account-invite:preview'
      : 'account-invite:empty';

  useEffect(() => {
    if (!deliveryToken) {
      return;
    }

    void writePendingInviteIntent({
      type: 'account_invite',
      token: deliveryToken,
    });
  }, [deliveryToken]);

  useFocusEffect(
    useCallback(() => {
      if (!deliveryToken || sessionStatus === 'loading' || sessionStatus === 'signed_out') {
        return undefined;
      }

      void refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
      return undefined;
    }, [deliveryToken, refreshAccountState, sessionStatus]),
  );

  async function handleActivate() {
    if (!deliveryToken || !session.currentDeviceId || busyAction) {
      return;
    }

    setBusyAction('activate');
    setMessage(null);

    try {
      const response = await activateInvite.mutateAsync({
        deliveryToken,
        currentDeviceId: session.currentDeviceId,
      });
      await session.refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
      await previewQuery.refetch();

      if (response.status === 'accepted') {
        await clearPendingInviteIntent();
        setMessage('Cuenta activada. Ya puedes entrar a Happy Circles.');
        await navigateHome();
        return;
      }

      if (response.status === 'pending_inviter_review') {
        await clearPendingInviteIntent();
        setMessage(
          'Tu cuenta ya quedo lista. Ahora falta que la otra persona confirme que eras el contacto esperado.',
        );
        await navigateHome();
        return;
      }

      setMessage('Terminamos este paso, pero todavia no pudimos cerrar la invitacion.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo activar esta cuenta.');
    } finally {
      setBusyAction(null);
    }
  }

  async function navigateHome() {
    await beginHomeEntryHandoffAfterScrollReset();
    returnToRoute(router, '/home');
  }

  return (
    <IdentityFlowScreen
      actions={
        <IdentityFlowSecondaryAction
          icon={session.accountAccessState === 'active' ? 'home-outline' : 'key-outline'}
          label={session.accountAccessState === 'active' ? 'Ir al inicio' : 'Usar otra invitacion'}
          onPress={() => {
            if (session.accountAccessState === 'active') {
              void navigateHome();
              return;
            }

            returnToRoute(router, '/join?mode=token');
          }}
          style={styles.secondaryActionFullWidth}
        />
      }
      bodyStyle={styles.activationBody}
      contentTransitionKey={contentTransitionKey}
      identity={<IdentityFlowIdentity state={tokenState} variant="status" />}
      identityPosition="top"
      message={<IdentityFlowLogoCopy subtitle={tokenSubtitle} title={tokenTitle} />}
      scrollEnabled
    >
      <View style={styles.activationMain}>
        {message ? <MessageBanner message={message} tone="neutral" /> : null}

        {preview ? (
          <IdentityFlowForm style={styles.activationForm}>
            {hasPreviewDetails && preview.channel && preview.expiresAt ? (
              <ActivationDetailRow
                icon="person"
                subtitle={`${channelLabel(preview.channel)} | vence ${new Date(
                  preview.expiresAt,
                ).toLocaleString('es-CO')}`}
                title={preview.inviterDisplayName ?? 'Invitacion privada'}
              />
            ) : null}

            {preview.intendedRecipientPhoneMasked && !tokenUnavailable ? (
              <ActivationDetailRow
                icon="call"
                subtitle={preview.intendedRecipientPhoneMasked}
                title="Contacto esperado"
              />
            ) : null}

            <Text style={styles.body}>{inviteReasonLabel(preview.reason)}</Text>

            {session.status === 'signed_out' && !tokenUnavailable ? (
              <View style={styles.actionStack}>
                <IdentityFlowPrimaryAction
                  label="Ingresar"
                  onPress={() =>
                    returnToRoute(
                      router,
                      deliveryToken
                        ? ({
                            pathname: '/join',
                            params: { mode: 'sign-in', token: deliveryToken },
                          } as unknown as Href)
                        : ({
                            pathname: '/join',
                            params: { mode: 'sign-in' },
                          } as unknown as Href),
                    )
                  }
                />
                <IdentityFlowSecondaryAction
                  icon="person-add-outline"
                  label="Crear acceso"
                  onPress={() =>
                    returnToRoute(
                      router,
                      deliveryToken
                        ? ({
                            pathname: '/join/[token]/create-account',
                            params: { token: deliveryToken },
                          } as Href)
                        : '/join',
                    )
                  }
                  style={styles.secondaryActionFullWidth}
                />
              </View>
            ) : null}

            {session.status !== 'signed_out' && canActivate ? (
              <View style={styles.actionStack}>
                {needsSetup ? (
                  <IdentityFlowPrimaryAction
                    label={setupBlockerLabel}
                    onPress={() => returnToRoute(router, buildSetupAccountHref(nextSetupStep))}
                  />
                ) : null}
                {!needsSetup && needsTrustedDevice ? (
                  <IdentityFlowPrimaryAction
                    label="Confiar este telefono"
                    onPress={() => returnToRoute(router, buildSetupAccountHref('security'))}
                  />
                ) : null}
                {!needsSetup && !needsTrustedDevice ? (
                  <IdentityFlowPrimaryAction
                    label={busyAction === 'activate' ? 'Activando...' : 'Activar mi cuenta'}
                    loading={busyAction === 'activate'}
                    onPress={busyAction ? undefined : () => void handleActivate()}
                  />
                ) : null}
              </View>
            ) : null}
            {session.status !== 'signed_out' &&
            canActivate &&
            (needsSetup || needsTrustedDevice) ? (
              <Text style={styles.actionHint}>
                {needsSetup
                  ? setupBlockerSubtitle
                  : 'Hace falta validar este telefono antes de activar la cuenta.'}
              </Text>
            ) : null}
          </IdentityFlowForm>
        ) : null}
      </View>
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  activationBody: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  activationMain: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  activationForm: {
    gap: theme.spacing.sm,
  },
  detailValue: {
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  detailTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  detailSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  body: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    lineHeight: 22,
    paddingHorizontal: theme.spacing.xs,
  },
  actionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: theme.spacing.xs,
    textAlign: 'center',
  },
  actionStack: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  secondaryActionFullWidth: {
    alignSelf: 'stretch',
    borderRadius: theme.radius.medium,
    minWidth: 0,
    width: '100%',
  },
});
