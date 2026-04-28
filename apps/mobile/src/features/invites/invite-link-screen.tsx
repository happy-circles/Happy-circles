import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SurfaceCard } from '@/components/surface-card';
import { clearPendingInviteIntent, writePendingInviteIntent } from '@/lib/invite-intent';
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
          returnToRoute(router, '/sign-in');
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
    <ScreenShell
      eyebrow="Invitacion"
      footer={
        <View style={styles.footer}>
          <PrimaryAction
            label="Ir al inicio"
            onPress={() => returnToRoute(router, '/home')}
            variant="ghost"
          />
        </View>
      }
      largeTitle={false}
      subtitle="El token abre la invitacion. Si tu celular coincide con el contacto esperado, la amistad puede quedar creada al reclamar; si no, pasa a validacion final."
      title="Invitacion de amistad"
    >
      {message ? <MessageBanner message={message} /> : null}

      {!deliveryToken ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Link invalido</Text>
          <Text style={styles.helper}>No encontramos el token de esta invitacion.</Text>
        </SurfaceCard>
      ) : null}

      {deliveryToken && !readyForPreview ? (
        <SurfaceCard padding="lg" variant="accent">
          <Text style={styles.title}>Preparando acceso</Text>
          <Text style={styles.helper}>
            Vamos a llevarte por login o setup antes de mostrar la confirmacion real de esta
            invitacion.
          </Text>
        </SurfaceCard>
      ) : null}

      {deliveryToken && readyForPreview && previewQuery.isLoading ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Leyendo invitacion</Text>
          <Text style={styles.helper}>Consultando el estado actual del token.</Text>
        </SurfaceCard>
      ) : null}

      {deliveryToken && readyForPreview && previewQuery.error ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>No pudimos abrir esta invitacion</Text>
          <Text style={styles.helper}>{previewQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

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
              onPress={() => returnToRoute(router, '/home')}
              variant="secondary"
            />
          ) : null}
        </SurfaceCard>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
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
