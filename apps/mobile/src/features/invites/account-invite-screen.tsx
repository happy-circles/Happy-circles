import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SurfaceCard } from '@/components/surface-card';
import {
  clearPendingInviteIntent,
  writePendingInviteIntent,
} from '@/lib/invite-intent';
import { buildSetupAccountHref } from '@/lib/setup-account';
import {
  useAccountInvitePreviewQuery,
  useActivateAccountFromInviteMutation,
  useReviewAccountInviteMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

function inviteReasonLabel(reason: string): string {
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
  return channel === 'qr' ? 'QR temporal' : 'Invitacion privada';
}

export function AccountInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const session = useSession();
  const activateInvite = useActivateAccountFromInviteMutation();
  const reviewInvite = useReviewAccountInviteMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'activate' | 'approve' | 'reject' | null>(null);

  const deliveryToken = useMemo(
    () => (typeof params.token === 'string' && params.token.trim().length > 0 ? params.token.trim() : null),
    [params.token],
  );
  const previewQuery = useAccountInvitePreviewQuery(deliveryToken);
  const preview = previewQuery.data;

  const isInviter = Boolean(preview && session.userId && preview.inviterUserId === session.userId);
  const isActivatedUser = Boolean(preview && session.userId && preview.activatedUserId === session.userId);
  const canActivate = preview
    ? Boolean(deliveryToken) &&
      !isInviter &&
      session.status !== 'signed_out' &&
      session.accountAccessState !== 'active' &&
      preview.status === 'pending_activation' &&
      preview.deliveryStatus !== 'revoked' &&
      preview.deliveryStatus !== 'expired'
    : false;
  const needsSetup = !session.setupState.requiredComplete;
  const needsTrustedDevice = session.deviceTrustState !== 'trusted';

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
        router.replace('/home');
        return;
      }

      if (response.status === 'pending_inviter_review') {
        await clearPendingInviteIntent();
        setMessage(
          'Tu cuenta ya quedo lista. Ahora falta que la otra persona confirme que eras el contacto esperado.',
        );
        router.replace('/home');
        return;
      }

      setMessage('Terminamos este paso, pero todavia no pudimos cerrar la invitacion.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo activar esta cuenta.');
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
      await previewQuery.refetch();
      setMessage(
        decision === 'approve'
          ? 'Listo. La cuenta quedo aprobada y la conexion fue creada.'
          : 'Cerramos esta invitacion sin crear la conexion.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la revision.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <ScreenShell
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Ir al inicio" onPress={() => router.replace('/home')} variant="ghost" />
        </View>
      }
      largeTitle={false}
      subtitle="Una invitacion privada te da acceso y puede conectarte automaticamente con quien te invito."
      title="Entrar con invitacion"
    >
      {message ? <MessageBanner message={message} tone="neutral" /> : null}

      {!deliveryToken ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Link invalido</Text>
          <Text style={styles.helper}>No encontramos el token de esta invitacion.</Text>
        </SurfaceCard>
      ) : null}

      {deliveryToken && previewQuery.isLoading ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Leyendo invitacion</Text>
          <Text style={styles.helper}>Confirmando si este acceso sigue disponible.</Text>
        </SurfaceCard>
      ) : null}

      {deliveryToken && previewQuery.error ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>No pudimos abrir esta invitacion</Text>
          <Text style={styles.helper}>{previewQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      {preview ? (
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.title}>{preview.inviterDisplayName}</Text>
          <Text style={styles.helper}>
            {channelLabel(preview.channel)} | vence{' '}
            {new Date(preview.expiresAt).toLocaleString('es-CO')}
          </Text>

          {preview.intendedRecipientAlias || preview.intendedRecipientPhoneE164 ? (
            <View style={styles.snapshotBlock}>
              <Text style={styles.snapshotTitle}>Contacto pensado</Text>
              {preview.intendedRecipientAlias ? (
                <Text style={styles.snapshotLine}>{preview.intendedRecipientAlias}</Text>
              ) : null}
              {preview.intendedRecipientPhoneE164 ? (
                <Text style={styles.snapshotLine}>
                  {[preview.intendedRecipientPhoneLabel, maskPhoneValue(preview.intendedRecipientPhoneE164)]
                    .filter(Boolean)
                    .join(' | ')}
                </Text>
              ) : null}
            </View>
          ) : null}

          {preview.activatedDisplayName ? (
            <View style={styles.snapshotBlock}>
              <Text style={styles.snapshotTitle}>Cuenta que ya reclamo este acceso</Text>
              <Text style={styles.snapshotLine}>{preview.activatedDisplayName}</Text>
            </View>
          ) : null}

          <Text style={styles.body}>{inviteReasonLabel(preview.reason)}</Text>

          {session.status === 'signed_out' ? (
            <View style={styles.actionStack}>
              <PrimaryAction
                href="/sign-in?mode=sign-in"
                label="Ingresar"
                subtitle="Si ya usaste Happy Circles en este telefono, entras mas rapido."
              />
              <PrimaryAction
                href="/sign-in?mode=register"
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
                  href={buildSetupAccountHref(session.setupState.pendingRequiredSteps[0] ?? 'profile')}
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

          {isInviter && preview.status === 'pending_inviter_review' ? (
            <View style={styles.actionStack}>
              <PrimaryAction
                label={busyAction === 'approve' ? 'Confirmando...' : 'Si es esta persona'}
                onPress={busyAction ? undefined : () => void handleReview('approve')}
                subtitle="Aprueba la cuenta y crea la conexion."
              />
              <PrimaryAction
                label={busyAction === 'reject' ? 'Cerrando...' : 'No corresponde'}
                onPress={busyAction ? undefined : () => void handleReview('reject')}
                variant="secondary"
              />
            </View>
          ) : null}

          {isActivatedUser && preview.status === 'pending_inviter_review' ? (
            <PrimaryAction
              label="Entrar a la app"
              onPress={() => router.replace('/home')}
              subtitle="Tu cuenta ya esta activa mientras se revisa esta conexion."
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
