import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowScreen,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import type { BrandVerificationState } from '@/components/brand-verification-lockup';
import { clearPendingInviteIntent, writePendingInviteIntent } from '@/lib/invite-intent';
import { beginHomeEntryHandoff } from '@/lib/home-entry-handoff';
import { returnToRoute } from '@/lib/navigation';
import { buildSetupAccountHref } from '@/lib/setup-account';
import {
  useAccountInvitePreviewQuery,
  useActivateAccountFromInviteMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

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

export function AccountInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const session = useSession();
  const activateInvite = useActivateAccountFromInviteMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'activate' | null>(null);

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
      session.status !== 'signed_out' &&
      session.accountAccessState !== 'active' &&
      preview.status === 'pending_activation' &&
      preview.deliveryStatus !== 'revoked' &&
      preview.deliveryStatus !== 'expired'
    : false;
  const needsSetup = !session.setupState.requiredComplete;
  const needsTrustedDevice = session.deviceTrustState !== 'trusted';
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
      await previewQuery.refetch();

      if (response.status === 'accepted') {
        await clearPendingInviteIntent();
        setMessage('Cuenta activada. Ya puedes entrar a Happy Circles.');
        beginHomeEntryHandoff();
        returnToRoute(router, '/home');
        return;
      }

      if (response.status === 'pending_inviter_review') {
        await clearPendingInviteIntent();
        setMessage(
          'Tu cuenta ya quedo lista. Ahora falta que la otra persona confirme que eras el contacto esperado.',
        );
        beginHomeEntryHandoff();
        returnToRoute(router, '/home');
        return;
      }

      setMessage('Terminamos este paso, pero todavia no pudimos cerrar la invitacion.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo activar esta cuenta.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <IdentityFlowScreen
      contentTransitionKey={contentTransitionKey}
      footer={
        <View style={styles.footer}>
          <PrimaryAction
            label="Ir al inicio"
            onPress={() => {
              beginHomeEntryHandoff();
              returnToRoute(router, '/home');
            }}
            variant="ghost"
          />
        </View>
      }
      identity={<IdentityFlowIdentity state={tokenState} variant="status" />}
      identityPosition="top"
      message={<IdentityFlowLogoCopy subtitle={tokenSubtitle} title={tokenTitle} />}
      scrollEnabled
    >
      {message ? <MessageBanner message={message} tone="neutral" /> : null}

      {preview ? (
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.title}>
            {preview.inviterDisplayName ?? 'Invitacion no disponible'}
          </Text>
          {hasPreviewDetails && preview.channel && preview.expiresAt ? (
            <Text style={styles.helper}>
              {channelLabel(preview.channel)} | vence{' '}
              {new Date(preview.expiresAt).toLocaleString('es-CO')}
            </Text>
          ) : null}

          {preview.intendedRecipientPhoneMasked ? (
            <View style={styles.snapshotBlock}>
              <Text style={styles.snapshotTitle}>Contacto pensado</Text>
              <Text style={styles.snapshotLine}>{preview.intendedRecipientPhoneMasked}</Text>
            </View>
          ) : null}

          <Text style={styles.body}>{inviteReasonLabel(preview.reason)}</Text>

          {session.status === 'signed_out' && !tokenUnavailable ? (
            <View style={styles.actionStack}>
              <PrimaryAction
                href={
                  deliveryToken
                    ? ({
                        pathname: '/join',
                        params: { mode: 'sign-in', token: deliveryToken },
                      } as unknown as Href)
                    : ({
                        pathname: '/join',
                        params: { mode: 'sign-in' },
                      } as unknown as Href)
                }
                label="Ingresar"
                subtitle="Si ya usaste Happy Circles en este telefono, entras mas rapido."
              />
              <PrimaryAction
                href={
                  deliveryToken
                    ? ({
                        pathname: '/join/[token]/create-account',
                        params: { token: deliveryToken },
                      } as Href)
                    : '/join'
                }
                label="Crear acceso"
                subtitle="Solo disponible porque esta invitacion sigue valida."
                variant="secondary"
              />
            </View>
          ) : null}

          {session.status !== 'signed_out' && canActivate ? (
            <View style={styles.actionStack}>
              {needsSetup ? (
                <PrimaryAction
                  href={buildSetupAccountHref(
                    session.setupState.pendingRequiredSteps[0] ?? 'profile',
                  )}
                  label="Completar perfil primero"
                  subtitle="Nombre, celular y foto siguen siendo obligatorios."
                  variant="secondary"
                />
              ) : null}
              {!needsSetup && needsTrustedDevice ? (
                <PrimaryAction
                  href={buildSetupAccountHref('security')}
                  label="Confiar este telefono"
                  subtitle="Hace falta antes de activar la cuenta."
                  variant="secondary"
                />
              ) : null}
              {!needsSetup && !needsTrustedDevice ? (
                <PrimaryAction
                  label={busyAction === 'activate' ? 'Activando...' : 'Activar mi cuenta'}
                  onPress={busyAction ? undefined : () => void handleActivate()}
                  subtitle="Si tu telefono coincide con el contacto esperado, quedara conectada de una vez."
                />
              ) : null}
            </View>
          ) : null}
        </SurfaceCard>
      ) : null}
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  body: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    lineHeight: 22,
  },
  snapshotBlock: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.xxs,
    padding: theme.spacing.md,
  },
  snapshotTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  snapshotLine: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    lineHeight: 20,
  },
  actionStack: {
    gap: theme.spacing.sm,
  },
});
