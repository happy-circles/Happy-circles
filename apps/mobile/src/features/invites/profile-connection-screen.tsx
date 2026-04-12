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
  useCreateRelationshipInviteMutation,
  useProfileConnectionPreviewQuery,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

function connectionReasonLabel(reason: string): string {
  if (reason === 'self') {
    return 'Ese QR pertenece a tu propio perfil.';
  }

  if (reason === 'already_connected') {
    return 'Ya tienes una relacion activa con esta persona.';
  }

  if (reason === 'incoming_pending') {
    return 'Ya tienes una invitacion pendiente por responder.';
  }

  if (reason === 'outgoing_pending') {
    return 'Ya habias enviado una invitacion a esta persona.';
  }

  return 'No puedes crear una invitacion desde este QR.';
}

export function ProfileConnectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { profileCompletionState, status } = useSession();
  const createRelationshipInvite = useCreateRelationshipInviteMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connectionToken = useMemo(
    () => (typeof params.token === 'string' && params.token.trim().length > 0 ? params.token.trim() : null),
    [params.token],
  );
  const readyForPreview = status !== 'signed_out' && profileCompletionState === 'complete';
  const previewQuery = useProfileConnectionPreviewQuery(readyForPreview ? connectionToken : null);
  const preview = previewQuery.data;

  useEffect(() => {
    let cancelled = false;

    async function syncAccess() {
      if (!connectionToken) {
        return;
      }

      if (status === 'signed_out') {
        await writePendingInviteIntent({
          type: 'profile_connection',
          token: connectionToken,
        });

        if (!cancelled) {
          router.replace('/sign-in');
        }
        return;
      }

      if (profileCompletionState === 'incomplete') {
        await writePendingInviteIntent({
          type: 'profile_connection',
          token: connectionToken,
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
  }, [connectionToken, profileCompletionState, router, status]);

  async function handleCreateInvite() {
    if (!preview?.canCreateInvite || busy) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await createRelationshipInvite.mutateAsync({
        inviteeUserId: preview.targetUserId,
        channelLabel: 'QR',
      });
      await clearPendingInviteIntent();
      setMessage('Invitacion creada. Ahora queda pendiente de respuesta.');
      router.replace('/invite/index');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la invitacion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      eyebrow="QR"
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Ir a invitaciones" onPress={() => router.replace('/invite/index')} variant="ghost" />
        </View>
      }
      largeTitle={false}
      subtitle="Escanear un QR solo prepara la conexion. La invitacion se crea cuando confirmas."
      title="Conectar perfil"
    >
      {message ? <MessageBanner message={message} /> : null}

      {!connectionToken ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>QR invalido</Text>
          <Text style={styles.helper}>No encontramos el token publico de este perfil.</Text>
        </SurfaceCard>
      ) : null}

      {connectionToken && !readyForPreview ? (
        <SurfaceCard padding="lg" variant="accent">
          <Text style={styles.title}>Preparando acceso</Text>
          <Text style={styles.helper}>
            Primero resolvemos tu sesion y tu perfil, luego mostramos la confirmacion.
          </Text>
        </SurfaceCard>
      ) : null}

      {connectionToken && readyForPreview && previewQuery.isLoading ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>Leyendo QR</Text>
          <Text style={styles.helper}>Buscando el perfil asociado a este token.</Text>
        </SurfaceCard>
      ) : null}

      {connectionToken && readyForPreview && previewQuery.error ? (
        <SurfaceCard padding="lg">
          <Text style={styles.title}>No pudimos abrir este QR</Text>
          <Text style={styles.helper}>{previewQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      {preview ? (
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.title}>{preview.displayName}</Text>
          <Text style={styles.helper}>
            {preview.canCreateInvite ? 'Perfil encontrado y listo para invitar.' : connectionReasonLabel(preview.reason)}
          </Text>
          {preview.existingInviteStatus ? (
            <Text style={styles.body}>
              Estado actual: {preview.existingInviteStatus}
              {preview.existingInviteDirection ? ` | ${preview.existingInviteDirection}` : ''}
            </Text>
          ) : null}

          {preview.canCreateInvite ? (
            <PrimaryAction
              label={busy ? 'Creando...' : 'Crear invitacion'}
              onPress={busy ? undefined : () => void handleCreateInvite()}
              subtitle="La otra persona la vera dentro de la app."
            />
          ) : (
            <PrimaryAction
              label="Abrir invitaciones"
              onPress={() => router.replace('/invite/index')}
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
