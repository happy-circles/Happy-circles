import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  useClaimExternalFriendshipInviteMutation,
  useFriendshipInvitePreviewQuery,
  useReviewExternalFriendshipInviteMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

function inviteReasonLabel(reason: string): string {
  if (reason === 'identity_incomplete') {
    return 'Completa tu perfil para poder reclamar esta invitacion.';
  }

  if (reason === 'already_connected') {
    return 'Ya tienes una relacion activa con esta persona.';
  }

  if (reason === 'sender_view') {
    return 'Esta invitacion sigue esperando a que alguien la reclame.';
  }

  if (reason === 'sender_review') {
    return 'Ya hay una cuenta esperando tu validacion.';
  }

  if (reason === 'claimed_by_other') {
    return 'Esta invitacion ya fue reclamada por otra cuenta.';
  }

  if (reason === 'delivery_revoked') {
    return 'Este acceso ya fue reemplazado por otro.';
  }

  if (reason === 'accepted') {
    return 'La amistad ya quedo creada.';
  }

  if (reason === 'rejected') {
    return 'Esta invitacion ya fue cerrada.';
  }

  if (reason === 'expired') {
    return 'Este acceso ya vencio.';
  }

  if (reason === 'canceled') {
    return 'La invitacion ya fue cancelada.';
  }

  return 'No puedes continuar con esta invitacion.';
}

function maskPhoneValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replaceAll(/\D/g, '');
  if (digits.length < 4) {
    return null;
  }

  return `***${digits.slice(-4)}`;
}

function channelLabel(channel: 'remote' | 'qr') {
  return channel === 'qr' ? 'QR temporal' : 'Invitacion remota';
}

function isUnavailableFriendshipInvite(reason: string) {
  return ['canceled', 'claimed_by_other', 'delivery_revoked', 'expired', 'rejected'].includes(
    reason,
  );
}

export function InviteLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { profileCompletionState, status } = useSession();
  const claimInvite = useClaimExternalFriendshipInviteMutation();
  const reviewInvite = useReviewExternalFriendshipInviteMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'claim' | 'approve' | 'reject' | null>(null);

  const deliveryToken = useMemo(
    () =>
      typeof params.token === 'string' && params.token.trim().length > 0
        ? params.token.trim()
        : null,
    [params.token],
  );
  const readyForPreview = status !== 'signed_out' && profileCompletionState === 'complete';
  const previewQuery = useFriendshipInvitePreviewQuery(readyForPreview ? deliveryToken : null);
  const preview = previewQuery.data;
  const tokenUnavailable = preview ? isUnavailableFriendshipInvite(preview.reason) : false;
  const tokenState: BrandVerificationState =
    !deliveryToken || previewQuery.error
      ? 'error'
      : !readyForPreview || previewQuery.isLoading
        ? 'loading'
        : preview
          ? tokenUnavailable
            ? 'error'
            : 'success'
          : 'idle';
  const tokenTitle = !deliveryToken
    ? 'Link invalido'
    : !readyForPreview
      ? 'Preparando acceso'
      : previewQuery.error
        ? 'No pudimos abrir esta invitacion'
        : previewQuery.isLoading
          ? 'Leyendo invitacion'
          : preview
            ? tokenUnavailable
              ? 'Invitacion no disponible'
              : preview.canApprove
                ? 'Valida esta conexion'
                : preview.canClaim
                  ? 'Invitacion lista'
                  : 'Invitacion revisada'
            : 'Invitacion de amistad';
  const tokenSubtitle = !deliveryToken
    ? 'No encontramos el token de esta invitacion.'
    : !readyForPreview
      ? 'Te llevamos por login o setup antes de mostrar la confirmacion real.'
      : previewQuery.error
        ? previewQuery.error.message
        : previewQuery.isLoading
          ? 'Consultando el estado actual del token.'
        : preview
          ? `${preview.inviterDisplayName} quiere conectar contigo en Happy Circles.`
          : 'El token abre una invitacion privada.';
  const contentTransitionKey =
    !readyForPreview || previewQuery.isLoading
      ? 'friend-invite:loading'
      : preview
        ? 'friend-invite:preview'
        : 'friend-invite:empty';

  useEffect(() => {
    let cancelled = false;

    async function syncAccess() {
      if (!deliveryToken) {
        return;
      }

      if (status === 'signed_out') {
        await writePendingInviteIntent({
          type: 'friendship_invite',
          token: deliveryToken,
        });

        if (!cancelled) {
          returnToRoute(router, '/join?mode=sign-in');
        }
        return;
      }

      if (profileCompletionState === 'incomplete') {
        await writePendingInviteIntent({
          type: 'friendship_invite',
          token: deliveryToken,
        });

        if (!cancelled) {
          returnToRoute(router, buildSetupAccountHref('profile'));
        }
      }
    }

    void syncAccess();

    return () => {
      cancelled = true;
    };
  }, [deliveryToken, profileCompletionState, router, status]);

  async function handleClaim() {
    if (!deliveryToken || busyAction) {
      return;
    }

    setBusyAction('claim');
    setMessage(null);

    try {
      const response = await claimInvite.mutateAsync(deliveryToken);
      await clearPendingInviteIntent();
      setMessage(
        response.status === 'accepted'
          ? 'Conexion confirmada. La amistad ya quedo creada.'
          : 'Reclamaste esta invitacion. Ahora falta la validacion final del otro lado.',
      );
      await previewQuery.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reclamar la invitacion.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReview(decision: 'approve' | 'reject') {
    if (!preview?.inviteId || busyAction) {
      return;
    }

    setBusyAction(decision);
    setMessage(null);

    try {
      await reviewInvite.mutateAsync({
        inviteId: preview.inviteId,
        decision,
      });
      await clearPendingInviteIntent();
      setMessage(
        decision === 'approve'
          ? 'Conexion confirmada. La amistad ya quedo creada.'
          : 'Invitacion cerrada. Puedes generar otra si lo necesitas.',
      );
      await previewQuery.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la validacion.');
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
      {message ? <MessageBanner message={message} /> : null}

      {preview ? (
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.title}>{preview.inviterDisplayName}</Text>
          <Text style={styles.helper}>
            {channelLabel(preview.channel)} |{' '}
            {preview.expiresAt
              ? `vence ${new Date(preview.expiresAt).toLocaleString('es-CO')}`
              : 'sin vencimiento'}
          </Text>

          {preview.intendedRecipientAlias || preview.intendedRecipientPhoneE164 ? (
            <View style={styles.snapshotBlock}>
              <Text style={styles.snapshotTitle}>Contacto pensado</Text>
              {preview.intendedRecipientAlias ? (
                <Text style={styles.snapshotLine}>{preview.intendedRecipientAlias}</Text>
              ) : null}
              {preview.intendedRecipientPhoneE164 ? (
                <Text style={styles.snapshotLine}>
                  {[
                    preview.intendedRecipientPhoneLabel,
                    maskPhoneValue(preview.intendedRecipientPhoneE164),
                  ]
                    .filter(Boolean)
                    .join(' | ')}
                </Text>
              ) : null}
            </View>
          ) : null}

          {preview.claimantSnapshot ? (
            <View style={styles.snapshotBlock}>
              <Text style={styles.snapshotTitle}>
                {preview.canApprove
                  ? 'Cuenta que reclamo esta invitacion'
                  : 'Cuenta que reclamo el acceso'}
              </Text>
              <Text style={styles.snapshotLine}>{preview.claimantSnapshot.displayName}</Text>
              {preview.claimantSnapshot.maskedEmail ? (
                <Text style={styles.snapshotLine}>{preview.claimantSnapshot.maskedEmail}</Text>
              ) : null}
              {preview.claimantSnapshot.maskedPhone ? (
                <Text style={styles.snapshotLine}>{preview.claimantSnapshot.maskedPhone}</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.body}>
            {preview.canClaim
              ? `${preview.inviterDisplayName} quiere conectar contigo en Happy Circles.`
              : preview.canApprove
                ? `Compara el contacto pensado con la cuenta que reclamo esta invitacion y confirma si si corresponde a la persona que querias agregar.`
                : inviteReasonLabel(preview.reason)}
          </Text>

          {preview.canClaim ? (
            <PrimaryAction
              label={busyAction === 'claim' ? 'Reclamando...' : 'Quiero conectar'}
              onPress={busyAction ? undefined : () => void handleClaim()}
              subtitle="Si tu celular coincide con el contacto esperado, puede quedar lista de una vez."
            />
          ) : null}

          {preview.canApprove ? (
            <View style={styles.actionStack}>
              <PrimaryAction
                label={busyAction === 'approve' ? 'Confirmando...' : 'Si es esta persona'}
                onPress={busyAction ? undefined : () => void handleReview('approve')}
                subtitle="Crea la amistad y cierra la invitacion"
              />
              <PrimaryAction
                label={busyAction === 'reject' ? 'Cerrando...' : 'No es'}
                onPress={busyAction ? undefined : () => void handleReview('reject')}
                variant="secondary"
              />
            </View>
          ) : null}

          {!preview.canClaim && !preview.canApprove ? (
            <PrimaryAction
              label="Volver al inicio"
              onPress={() => {
                beginHomeEntryHandoff();
                returnToRoute(router, '/home');
              }}
              variant="secondary"
            />
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
