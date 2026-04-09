import { useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import {
  useAcceptRelationshipInviteMutation,
  useAppSnapshot,
  useCreateWhatsAppInviteMutation,
  useRejectRelationshipInviteMutation,
} from '@/lib/live-data';
import { formatCop } from '@/lib/data';
import { buildPhoneE164, COUNTRY_OPTIONS, DEFAULT_COUNTRY, formatPhoneForWhatsApp } from '@/lib/phone';
import { theme } from '@/lib/theme';

function formatInviteDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'reciente';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function buildWhatsAppInviteMessage(input: {
  readonly inviteeName: string;
  readonly amountMinor: number | null;
  readonly direction: 'i_owe' | 'owes_me' | null;
  readonly description: string | null;
}): string {
  const inviteeName = input.inviteeName;
  const prefix = inviteeName.trim().length > 0 ? `Hola ${inviteeName.trim()},` : 'Hola,';

  if (input.amountMinor && input.amountMinor > 0 && input.direction) {
    const relationText = input.direction === 'i_owe' ? 'te debo' : 'me debes';
    const descriptionText =
      input.description && input.description.trim().length > 0
        ? ` por ${input.description.trim()}`
        : '';

    return `${prefix} se que ${relationText} ${formatCop(input.amountMinor)}${descriptionText}. Para llevarlo facil y sin mensajes perdidos, usemos Happy Circles. Registrate con este mismo numero para que la solicitud te aparezca dentro de la app.`;
  }

  return `${prefix} te invito a Happy Circles para llevar cuentas pendientes y pagos entre amigos sin enredos. Registrate con este mismo numero para que la invitacion te aparezca dentro de la app.`;
}

export function InvitePersonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    inviteeName?: string;
    amountMinor?: string;
    direction?: string;
    description?: string;
  }>();
  const snapshotQuery = useAppSnapshot();
  const createWhatsAppInvite = useCreateWhatsAppInviteMutation();
  const acceptInvite = useAcceptRelationshipInviteMutation();
  const rejectInvite = useRejectRelationshipInviteMutation();

  const initialInviteeName = typeof params.inviteeName === 'string' ? params.inviteeName : '';
  const transactionAmountMinor =
    typeof params.amountMinor === 'string' ? Number.parseInt(params.amountMinor, 10) : Number.NaN;
  const transactionDirection =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;
  const transactionDescription = typeof params.description === 'string' ? params.description : null;

  const [inviteeName, setInviteeName] = useState(initialInviteeName);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso2);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY,
    [countryIso],
  );
  const incomingInvites = snapshotQuery.data?.incomingInvites ?? [];
  const whatsappInvites = snapshotQuery.data?.whatsappInvites ?? [];

  async function handleCreateInvite() {
    setBusyKey('create-whatsapp');
    setMessage(null);

    try {
      const response = await createWhatsAppInvite.mutateAsync({
        inviteeName,
        phoneCountryIso2: selectedCountry.iso2,
        phoneCountryCallingCode: selectedCountry.callingCode,
        phoneNationalNumber,
      });

      const phoneE164 =
        'phoneE164' in response && typeof response.phoneE164 === 'string'
          ? response.phoneE164
          : buildPhoneE164(selectedCountry.callingCode, phoneNationalNumber);
      const whatsappText = buildWhatsAppInviteMessage({
        inviteeName,
        amountMinor:
          Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 ? transactionAmountMinor : null,
        direction: transactionDirection,
        description: transactionDescription,
      });
      const whatsappUrl = `https://wa.me/${formatPhoneForWhatsApp(phoneE164)}?text=${encodeURIComponent(whatsappText)}`;

      await Linking.openURL(whatsappUrl);

      setInviteeName('');
      setPhoneNationalNumber('');
      setMessage(
        response.status === 'matched'
          ? 'Abrimos WhatsApp y la persona ya quedo enlazada con la app.'
          : 'Abrimos WhatsApp con el mensaje listo. Cuando esa persona se registre con este numero, la app la enlazara.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo preparar la invitacion.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleIncomingInvite(inviteId: string, action: 'accept' | 'reject') {
    setBusyKey(`${action}:${inviteId}`);
    setMessage(null);

    try {
      if (action === 'accept') {
        await acceptInvite.mutateAsync(inviteId);
        setMessage('Invitacion aceptada. La relacion ya deberia aparecer en tu app.');
      } else {
        await rejectInvite.mutateAsync(inviteId);
        setMessage('Invitacion rechazada.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo responder la invitacion.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScreenShell
      eyebrow="Red"
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="ghost" />
        </View>
      }
      largeTitle={false}
      subtitle="Invita en segundos y manten visible lo importante: pendientes, seguimiento y contexto."
      title="Invitar persona"
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.cardTitle}>Invita con contexto y sigue el estado sin salir de la app.</Text>
        <Text style={styles.helper}>
          Primero WhatsApp, luego el enlace automatico a la cuenta cuando la otra persona se registre.
        </Text>
      </SurfaceCard>

      {message ? <MessageBanner message={message} /> : null}

      {Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 && transactionDirection ? (
        <SurfaceCard padding="lg" variant="accent">
          <Text style={styles.cardTitle}>Esta invitacion nace desde un movimiento</Text>
          <Text style={styles.helper}>
            {transactionDirection === 'i_owe' ? 'Le debes' : 'Te debe'} {formatCop(transactionAmountMinor)}
            {transactionDescription && transactionDescription.trim().length > 0
              ? ` por ${transactionDescription.trim()}`
              : ''}
            . Ese contexto saldra listo en el mensaje de WhatsApp.
          </Text>
        </SurfaceCard>
      ) : null}

      {snapshotQuery.isLoading ? (
        <SurfaceCard>
          <Text style={styles.helper}>Cargando invitaciones y relaciones...</Text>
        </SurfaceCard>
      ) : null}

      {snapshotQuery.error ? (
        <SurfaceCard>
          <Text style={styles.cardTitle}>No pudimos cargar invitaciones.</Text>
          <Text style={styles.helper}>{snapshotQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error ? (
        <>
          <SectionBlock title="Responder pendientes" subtitle="Acepta o rechaza lo que ya llego a tu cuenta.">
            {incomingInvites.length === 0 ? (
              <EmptyState
                description="Cuando alguien te invite y tu cuenta ya este vinculada, aparecera aqui."
                title="Nada pendiente por responder"
              />
            ) : (
              incomingInvites.map((invite) => (
                <SurfaceCard key={invite.id} padding="lg">
                  <View style={styles.header}>
                    <View style={styles.textWrap}>
                      <Text style={styles.cardTitle}>{invite.displayName}</Text>
                      <Text style={styles.helper}>Recibida {formatInviteDate(invite.createdAt)}</Text>
                    </View>
                    <StatusChip label={invite.status} tone="warning" />
                  </View>
                  <View style={styles.actionRow}>
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label={busyKey === `accept:${invite.id}` ? 'Aceptando...' : 'Aceptar'}
                        onPress={busyKey ? undefined : () => void handleIncomingInvite(invite.id, 'accept')}
                      />
                    </View>
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label={busyKey === `reject:${invite.id}` ? 'Rechazando...' : 'Rechazar'}
                        onPress={busyKey ? undefined : () => void handleIncomingInvite(invite.id, 'reject')}
                        variant="ghost"
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ))
            )}
          </SectionBlock>

          <SectionBlock
            title="Enviar por WhatsApp"
            subtitle="Pide solo nombre y celular. El pais va precargado para reducir pasos."
          >
            <SurfaceCard padding="lg" variant="elevated">
              <FieldBlock label="Nombre">
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setInviteeName}
                  placeholder="Nombre y apellido"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  value={inviteeName}
                />
              </FieldBlock>

              <FieldBlock label="Celular">
                <View style={styles.phoneRow}>
                  <View style={styles.callingCodeBox}>
                    <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                  </View>
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={setPhoneNationalNumber}
                    placeholder="3001234567"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.input, styles.phoneInput]}
                    value={phoneNationalNumber}
                  />
                </View>
              </FieldBlock>

              <FieldBlock label="Pais">
                <View style={styles.choiceRow}>
                  {COUNTRY_OPTIONS.map((country) => (
                    <ChoiceChip
                      key={country.iso2}
                      label={`${country.label} ${country.callingCode}`}
                      onPress={() => setCountryIso(country.iso2)}
                      selected={country.iso2 === selectedCountry.iso2}
                    />
                  ))}
                </View>
              </FieldBlock>

              <PrimaryAction
                label={busyKey === 'create-whatsapp' ? 'Preparando...' : 'Enviar por WhatsApp'}
                onPress={busyKey ? undefined : () => void handleCreateInvite()}
                subtitle="Mensaje listo con el contexto correcto"
              />
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock title="Seguimiento" subtitle="Aqui ves si la invitacion sigue afuera o ya quedo enlazada.">
            {whatsappInvites.length === 0 ? (
              <EmptyState
                description="Cuando compartas una invitacion externa, aqui veras si sigue pendiente o si ya quedo conectada a una cuenta."
                title="Aun no has enviado invitaciones"
              />
            ) : (
              whatsappInvites.map((invite) => (
                <SurfaceCard key={invite.id} padding="lg">
                  <View style={styles.header}>
                    <View style={styles.textWrap}>
                      <Text style={styles.cardTitle}>{invite.inviteeName}</Text>
                      <Text style={styles.helper}>
                        {invite.phoneE164} | Enviada {formatInviteDate(invite.createdAt)}
                      </Text>
                      {invite.matchedDisplayName ? (
                        <Text style={styles.helper}>
                          Enlazada con {invite.matchedDisplayName}
                          {invite.relationshipInviteId ? ' y pendiente dentro de la app.' : '.'}
                        </Text>
                      ) : null}
                    </View>
                    <StatusChip
                      label={invite.status === 'matched' ? 'Enlazada' : 'Pendiente'}
                      tone={invite.status === 'matched' ? 'primary' : 'neutral'}
                    />
                  </View>
                </SurfaceCard>
              ))
            )}
          </SectionBlock>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionSlot: {
    flex: 1,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  phoneRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: theme.spacing.md,
  },
  callingCodeText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
  },
});
