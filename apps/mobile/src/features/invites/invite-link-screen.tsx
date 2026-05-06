import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import {
  IdentityFlowIdentity,
  IdentityFlowLogoCopy,
  IdentityFlowScreen,
} from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { SurfaceCard } from '@/components/surface-card';
import type { BrandVerificationState } from '@/components/brand-verification-lockup';
import { resolveAvatarUrl } from '@/lib/avatar';
import { clearPendingInviteIntent, writePendingInviteIntent } from '@/lib/invite-intent';
import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import { returnToRoute } from '@/lib/navigation';
import { buildSetupAccountHref } from '@/lib/setup-account';
import {
  useClaimExternalFriendshipInviteMutation,
  useFriendshipInvitePreviewQuery,
  useReviewExternalFriendshipInviteMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';

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

function channelLabel(channel: 'remote' | 'qr') {
  return channel === 'qr' ? 'QR temporal' : 'Invitacion remota';
}

function isUnavailableFriendshipInvite(reason: string) {
  return ['canceled', 'claimed_by_other', 'delivery_revoked', 'expired', 'rejected'].includes(
    reason,
  );
}

type InviteDecisionTone = 'primary' | 'danger';

interface InviteDecisionButtonProps {
  readonly disabled?: boolean;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress?: () => void;
  readonly tone: InviteDecisionTone;
}

function InviteDecisionButton({
  disabled = false,
  icon,
  label,
  onPress,
  tone,
}: InviteDecisionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.decisionButton,
        tone === 'primary' ? styles.decisionButtonPrimary : styles.decisionButtonDanger,
        pressed && !disabled ? styles.decisionButtonPressed : null,
        disabled ? styles.decisionButtonDisabled : null,
      ]}
    >
      <Ionicons
        color={tone === 'primary' ? theme.colors.primary : theme.colors.danger}
        name={icon}
        size={16}
      />
      <AppText
        numberOfLines={1}
        style={[
          styles.decisionButtonText,
          tone === 'primary' ? styles.decisionButtonPrimaryText : styles.decisionButtonDangerText,
        ]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function InviteLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const session = useSession();
  const { profileCompletionState, status } = session;
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
  const setupEntryStep = session.setupState.pendingRequiredSteps[0] ?? 'profile';
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
                ? 'Revisar conexion'
                : preview.canClaim
                  ? 'Invitacion de amistad'
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
            ? tokenUnavailable || (!preview.canClaim && !preview.canApprove)
              ? inviteReasonLabel(preview.reason)
              : 'Responde cuando reconozcas esta invitacion.'
            : 'El token abre una invitacion privada.';
  const previewPersonName =
    preview?.canApprove && preview.claimantSnapshot
      ? preview.claimantSnapshot.displayName
      : (preview?.inviterDisplayName ?? 'Persona');
  const previewAvatarUrl =
    preview?.canApprove && preview.claimantSnapshot
      ? resolveAvatarUrl(preview.claimantSnapshot.avatarPath)
      : resolveAvatarUrl(preview?.inviterAvatarPath ?? null);
  const previewInviteType = preview
    ? preview.canApprove
      ? `${channelLabel(preview.channel)} | por confirmar`
      : channelLabel(preview.channel)
    : null;
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
          returnToRoute(router, buildSetupAccountHref(setupEntryStep));
        }
      }
    }

    void syncAccess();

    return () => {
      cancelled = true;
    };
  }, [deliveryToken, profileCompletionState, router, setupEntryStep, status]);

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

  async function handleDismissInvite() {
    await clearPendingInviteIntent();
    await navigateHome();
  }

  async function navigateHome() {
    await beginHomeEntryHandoffAfterScrollReset();
    returnToRoute(router, '/home');
  }

  return (
    <IdentityFlowScreen
      contentTransitionKey={contentTransitionKey}
      identity={<IdentityFlowIdentity state={tokenState} variant="status" />}
      identityPosition="top"
      message={<IdentityFlowLogoCopy subtitle={tokenSubtitle} title={tokenTitle} />}
      scrollEnabled
    >
      {message ? <MessageBanner message={message} /> : null}

      {preview ? (
        <SurfaceCard padding="md" style={styles.inviteCard} variant="elevated">
          <View style={styles.invitePersonRow}>
            <AppAvatar imageUrl={previewAvatarUrl} label={previewPersonName} size={52} />
            <View style={styles.invitePersonCopy}>
              <AppText numberOfLines={1} style={styles.title}>
                {previewPersonName}
              </AppText>
              {previewInviteType ? (
                <AppText style={styles.helper}>{previewInviteType}</AppText>
              ) : null}
            </View>
          </View>

          {preview.canClaim ? (
            <View style={styles.actionRow}>
              <InviteDecisionButton
                disabled={Boolean(busyAction)}
                icon={
                  busyAction === 'claim' ? 'ellipsis-horizontal-circle-outline' : 'checkmark-circle'
                }
                label={busyAction === 'claim' ? 'Aceptando' : 'Aceptar'}
                onPress={() => void handleClaim()}
                tone="primary"
              />
              <InviteDecisionButton
                disabled={Boolean(busyAction)}
                icon="close-circle-outline"
                label="No aceptar"
                onPress={() => void handleDismissInvite()}
                tone="danger"
              />
            </View>
          ) : null}

          {preview.canApprove ? (
            <View style={styles.actionRow}>
              <InviteDecisionButton
                disabled={Boolean(busyAction)}
                icon={
                  busyAction === 'approve'
                    ? 'ellipsis-horizontal-circle-outline'
                    : 'checkmark-circle'
                }
                label={busyAction === 'approve' ? 'Aceptando' : 'Aceptar'}
                onPress={() => void handleReview('approve')}
                tone="primary"
              />
              <InviteDecisionButton
                disabled={Boolean(busyAction)}
                icon={
                  busyAction === 'reject'
                    ? 'ellipsis-horizontal-circle-outline'
                    : 'close-circle-outline'
                }
                label={busyAction === 'reject' ? 'Enviando' : 'No aceptar'}
                onPress={() => void handleReview('reject')}
                tone="danger"
              />
            </View>
          ) : null}

          {!preview.canClaim && !preview.canApprove ? (
            <PrimaryAction
              label="Volver al inicio"
              onPress={() => void navigateHome()}
              variant="secondary"
            />
          ) : null}
        </SurfaceCard>
      ) : null}
    </IdentityFlowScreen>
  );
}

const styles = StyleSheet.create({
  inviteCard: {
    gap: theme.spacing.md,
  },
  invitePersonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  invitePersonCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 20,
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  actionRow: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  decisionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: theme.spacing.xs,
  },
  decisionButtonPrimary: {
    backgroundColor: theme.colors.primaryGhost,
  },
  decisionButtonDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  decisionButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  decisionButtonDisabled: {
    opacity: 0.58,
  },
  decisionButtonText: {
    flexShrink: 1,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 16,
  },
  decisionButtonPrimaryText: {
    color: theme.colors.primary,
  },
  decisionButtonDangerText: {
    color: theme.colors.danger,
  },
});
