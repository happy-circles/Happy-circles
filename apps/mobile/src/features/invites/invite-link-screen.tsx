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
import {
  useAcceptInviteByTokenMutation,
  useInvitePreviewByTokenQuery,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

function inviteReasonLabel(reason: string): string {
  if (reason === 'self') {
    return 'Este link te pertenece a ti.';
  }

  if (reason === 'already_connected') {
    return 'Ya tienes una relacion activa con esta persona.';
  }

  if (reason === 'accepted') {
    return 'Este link ya fue usado.';
  }

  if (reason === 'rejected') {
    return 'Esta invitacion ya fue rechazada.';
  }

  if (reason === 'expired') {
    return 'Este link ya vencio.';
  }

  if (reason === 'canceled') {
    return 'Este link ya no esta disponible.';
  }

  return 'No puedes aceptar esta invitacion.';
}

export function InviteLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { profileCompletionState, status } = useSession();
  const acceptInviteByToken = useAcceptInviteByTokenMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inviteToken = useMemo(
    () => (typeof params.token === 'string' && params.token.trim().length > 0 ? params.token.trim() : null),
    [params.token],
  );
  const readyForPreview = status !== 'signed_out' && profileCompletionState === 'complete';
  const previewQuery = useInvitePreviewByTokenQuery(readyForPreview ? inviteToken : null);
  const preview = previewQuery.data;

  useEffect(() => {
    let cancelled = false;

    async function syncAccess() {
      if (!inviteToken) {
        return;
      }

      if (status === 'signed_out') {
        await writePendingInviteIntent({
          type: 'invite_link',
          token: inviteToken,
        });

        if (!cancelled) {
          router.replace('/sign-in');
        }
        return;
      }

      if (profileCompletionState === 'incomplete') {
        await writePendingInviteIntent({
          type: 'invite_link',
          token: inviteToken,
        });

        if (!cancelled) {
          router.replace('/complete-profile');
        }
      }
    }

    void syncAccess();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, profileCompletionState, router, status]);

  async function handleAccept() {
    if (!inviteToken || busy) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await acceptInviteByToken.mutateAsync(inviteToken);
      await clearPendingInviteIntent();
      setMessage('Invitacion aceptada. La relacion ya quedo creada.');
      router.replace('/home');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo aceptar la invitacion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      eyebrow="Invitacion"
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Ir al inicio" onPress={() => router.replace('/home')} variant="ghost" />
        </View>
      }
      largeTitle={false}
      subtitle="Confirma antes de crear la relacion dentro de Happy Circles."
      title="Aceptar link"
    >
      {message ? <MessageBanner message={message} /> : null}

      {!inviteToken ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Link invalido</Text>
          <Text style={styles.helper}>No encontramos el token de esta invitacion.</Text>
        </SurfaceCard>
      ) : null}

      {inviteToken && !readyForPreview ? (
        <SurfaceCard padding="lg" variant="accent">
          <Text style={styles.title}>Preparando acceso</Text>
          <Text style={styles.helper}>
            Vamos a llevarte por login o perfil antes de mostrar la confirmacion final.
          </Text>
        </SurfaceCard>
      ) : null}

      {inviteToken && readyForPreview && previewQuery.isLoading ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Leyendo invitacion</Text>
          <Text style={styles.helper}>Consultando el estado real del link en Supabase.</Text>
        </SurfaceCard>
      ) : null}

      {inviteToken && readyForPreview && previewQuery.error ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>No pudimos abrir esta invitacion</Text>
          <Text style={styles.helper}>{previewQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      {preview ? (
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.title}>{preview.inviterDisplayName}</Text>
          <Text style={styles.helper}>
            {preview.channelLabel} | {preview.expiresAt ? `vence ${new Date(preview.expiresAt).toLocaleString('es-CO')}` : 'sin vencimiento'}
          </Text>
          <Text style={styles.body}>
            {preview.canAccept
              ? `${preview.inviterDisplayName} quiere conectar contigo en Happy Circles.`
              : inviteReasonLabel(preview.reason)}
          </Text>

          {preview.canAccept ? (
            <PrimaryAction
              label={busy ? 'Aceptando...' : 'Aceptar invitacion'}
              onPress={busy ? undefined : () => void handleAccept()}
              subtitle="La relacion se crea solo cuando confirmes."
            />
          ) : (
            <PrimaryAction
              label="Volver al inicio"
              onPress={() => router.replace('/home')}
              variant="secondary"
            />
          )}
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
});
