import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { happyCircleDecisionColor } from '@/components/happy-circle-ring';
import { formatCop } from '@/lib/data';
import {
  type SettlementDetailMovementDto,
  type SettlementDetailParticipantDto,
} from '@/lib/live-data';
import { transactionAmountIsVoided } from '@/lib/transaction-presentation';
import { useAppTheme } from '@/providers/theme-provider';
import { settlementDetailStoryStyles as styles } from './settlement-detail-story-styles';

function personalMovementsForUser(
  movements: readonly SettlementDetailMovementDto[],
  currentUserId: string | null,
): readonly SettlementDetailMovementDto[] {
  if (!currentUserId) {
    return [];
  }

  const incoming = movements.filter((movement) => movement.creditorUserId === currentUserId);
  const outgoing = movements.filter((movement) => movement.debtorUserId === currentUserId);
  return [...incoming, ...outgoing];
}

function participantById(
  participants: readonly SettlementDetailParticipantDto[],
  userId: string | null,
  fallbackLabel: string,
): SettlementDetailParticipantDto | null {
  if (!userId) {
    return null;
  }

  return (
    participants.find((participant) => participant.userId === userId) ?? {
      userId,
      label: fallbackLabel,
      decision: 'pending',
    }
  );
}

function approvalDecisionLabel(decision: SettlementDetailParticipantDto['decision']): string {
  if (decision === 'approved') {
    return 'Aprobado';
  }

  if (decision === 'rejected') {
    return 'No aprobado';
  }

  return 'Pendiente';
}

function approvalDecisionIconName(
  decision: SettlementDetailParticipantDto['decision'],
): keyof typeof Ionicons.glyphMap {
  if (decision === 'approved') {
    return 'checkmark-circle';
  }

  if (decision === 'rejected') {
    return 'close-circle';
  }

  return 'time-outline';
}

function approvalParticipantsForDisplay(
  participants: readonly SettlementDetailParticipantDto[],
  currentUserId: string | null,
): readonly SettlementDetailParticipantDto[] {
  if (!currentUserId) {
    return participants;
  }

  const currentParticipant = participants.find(
    (participant) => participant.userId === currentUserId,
  );
  if (!currentParticipant) {
    return participants;
  }

  return [
    currentParticipant,
    ...participants.filter((participant) => participant.userId !== currentUserId),
  ];
}

export function settlementStoryHeadline({
  approvalsPending,
  canDecide,
  status,
}: {
  readonly approvalsPending: number;
  readonly canDecide: boolean;
  readonly status: string;
}): string {
  if (status === 'pending_approvals') {
    if (canDecide) {
      return 'Te toca decidir este Circle';
    }

    if (approvalsPending === 0) {
      return 'Listo para registrar';
    }

    return approvalsPending === 1 ? 'Falta una aprobacion' : 'Faltan aprobaciones';
  }

  if (status === 'approved') {
    return 'Listo para registrar';
  }

  if (status === 'executed') {
    return 'Circle completado';
  }

  if (status === 'rejected') {
    return 'Circle no aprobado';
  }

  if (status === 'stale') {
    return 'Calculo reemplazado';
  }

  if (status === 'expired') {
    return 'Circle expirado';
  }

  return 'Movimiento propuesto';
}

export function ApprovalPills({
  participants,
}: {
  readonly participants: readonly SettlementDetailParticipantDto[];
}) {
  if (participants.length === 0) {
    return null;
  }

  return (
    <View style={styles.approvalPillsRow}>
      {participants.map((participant) => {
        const color = happyCircleDecisionColor(participant.decision);

        return (
          <View
            accessible
            accessibilityLabel={`${participant.label}: ${approvalDecisionLabel(participant.decision)}`}
            key={participant.userId}
            style={[styles.approvalPill, { backgroundColor: color, shadowColor: color }]}
          />
        );
      })}
    </View>
  );
}

export function ApprovalDecisionList({
  currentUserId,
  participants,
}: {
  readonly currentUserId: string | null;
  readonly participants: readonly SettlementDetailParticipantDto[];
}) {
  const activeTheme = useAppTheme();
  const orderedParticipants = approvalParticipantsForDisplay(participants, currentUserId);

  if (orderedParticipants.length === 0) {
    return null;
  }

  return (
    <View style={styles.approvalDecisionList}>
      {orderedParticipants.map((participant) => {
        const color = happyCircleDecisionColor(participant.decision);
        const isCurrentUser = participant.userId === currentUserId;
        const isRejected = participant.decision === 'rejected';

        return (
          <View
            key={participant.userId}
            style={[
              styles.approvalDecisionRow,
              {
                backgroundColor: activeTheme.colors.surfaceSoft,
                borderColor: isRejected
                  ? `${activeTheme.colors.danger}30`
                  : activeTheme.colors.hairline,
              },
            ]}
          >
            <View style={[styles.approvalDecisionIcon, { backgroundColor: `${color}14` }]}>
              <Ionicons
                color={color}
                name={approvalDecisionIconName(participant.decision)}
                size={18}
              />
            </View>
            <View style={styles.approvalDecisionCopy}>
              <AppText
                numberOfLines={1}
                style={[
                  styles.approvalDecisionName,
                  {
                    color: isRejected ? activeTheme.colors.danger : activeTheme.colors.text,
                  },
                ]}
              >
                {participant.label}
              </AppText>
              <AppText numberOfLines={1} style={[styles.approvalDecisionStatus, { color }]}>
                {approvalDecisionLabel(participant.decision)}
              </AppText>
            </View>
            {isCurrentUser ? (
              <View
                style={[
                  styles.approvalSelfBadge,
                  {
                    backgroundColor: `${activeTheme.colors.cycle}12`,
                    borderColor: `${activeTheme.colors.cycle}26`,
                  },
                ]}
              >
                <AppText
                  style={[styles.approvalSelfBadgeText, { color: activeTheme.colors.cycle }]}
                >
                  Tu
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function approvalProgressText({
  approvalsPending,
  participantCount,
  status,
}: {
  readonly approvalsPending: number;
  readonly participantCount: number;
  readonly status: string;
}): string | null {
  if (participantCount === 0) {
    return 'Sin aprobaciones.';
  }

  if (status === 'pending_approvals') {
    if (approvalsPending === 0) {
      return 'Sin pendientes.';
    }

    return `Falta ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'}.`;
  }

  if (status === 'approved') {
    return 'Aprobado por todos. Falta registrarlo.';
  }

  if (status === 'executed') {
    return 'Cerrado y registrado.';
  }

  if (status === 'rejected') {
    return 'No aprobado. No aplico movimientos.';
  }

  if (status === 'stale') {
    return 'Reemplazado por un calculo nuevo.';
  }

  if (status === 'expired') {
    return 'Expiro antes de completarse.';
  }

  return null;
}

export function settlementStoryText(status: string, approvalsPending: number): string {
  if (status === 'pending_approvals') {
    if (approvalsPending === 0) {
      return 'Todos aprobaron este calculo. El siguiente paso es registrar los movimientos para cerrar saldos.';
    }

    return 'Este calculo muestra quien paga y quien recibe. Solo se aplica cuando las aprobaciones necesarias estan completas.';
  }

  if (status === 'approved') {
    return 'El acuerdo ya esta aprobado. Falta registrar el movimiento final para que el saldo quede cerrado.';
  }

  if (status === 'executed') {
    return 'El Circle ya se cerro y los movimientos quedaron registrados en los perfiles.';
  }

  if (status === 'rejected') {
    return 'El Circle se cancelo. Los montos quedan en rojo y tachados porque no cambiaron ningun saldo.';
  }

  if (status === 'stale') {
    return 'Los saldos cambiaron y este calculo dejo de ser el actual. Usa el nuevo calculo para decidir.';
  }

  if (status === 'expired') {
    return 'El Circle expiro antes de cerrarse. No se aplico ningun movimiento.';
  }

  return 'Movimientos para cuadrar saldos.';
}

function TransactionChangeRow({
  active,
  amountLabel,
  amountStruckThrough,
  detail,
  iconName,
  onPress,
  title,
  tone,
}: {
  readonly active: boolean;
  readonly amountLabel: string;
  readonly amountStruckThrough?: boolean;
  readonly detail?: string | null;
  readonly iconName: keyof typeof Ionicons.glyphMap;
  readonly onPress?: () => void;
  readonly title: string;
  readonly tone: 'success' | 'warning';
}) {
  const activeTheme = useAppTheme();
  const toneColor = amountStruckThrough
    ? activeTheme.colors.danger
    : tone === 'success'
      ? activeTheme.colors.success
      : activeTheme.colors.warning;
  const color = active ? toneColor : activeTheme.colors.textMuted;
  const isActionable = active && typeof onPress === 'function';

  return (
    <Pressable
      accessibilityLabel={[title, amountLabel, detail].filter(Boolean).join(', ')}
      accessibilityRole={isActionable ? 'link' : undefined}
      disabled={!isActionable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.transactionChangeRow,
        {
          backgroundColor: activeTheme.colors.surfaceSoft,
          borderColor: amountStruckThrough
            ? `${activeTheme.colors.danger}30`
            : activeTheme.colors.hairline,
        },
        isActionable ? styles.transactionChangeRowAction : null,
        pressed ? styles.transactionChangeRowPressed : null,
      ]}
    >
      <View
        style={[
          styles.transactionChangeIcon,
          { backgroundColor: active ? `${toneColor}12` : activeTheme.colors.surfaceSoft },
        ]}
      >
        <Ionicons color={color} name={iconName} size={22} />
      </View>
      <View style={styles.transactionChangeCopy}>
        <AppText
          numberOfLines={1}
          style={[styles.transactionChangeTitle, { color: activeTheme.colors.text }]}
        >
          {title}
        </AppText>
        {detail ? (
          <AppText
            numberOfLines={2}
            style={[styles.transactionChangeDetail, { color: activeTheme.colors.textMuted }]}
          >
            {detail}
          </AppText>
        ) : null}
      </View>
      <View style={styles.transactionChangeAmountSlot}>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.76}
          numberOfLines={1}
          style={[
            styles.transactionChangeAmount,
            { color },
            amountStruckThrough ? styles.transactionChangeAmountVoided : null,
          ]}
        >
          {amountLabel}
        </AppText>
      </View>
      {isActionable ? (
        <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={16} />
      ) : null}
    </Pressable>
  );
}

export function CircleMovementDetails({
  currentUserId,
  movements,
  onOpenMovement,
  participants,
  status,
}: {
  readonly currentUserId: string | null;
  readonly movements: readonly SettlementDetailMovementDto[];
  readonly onOpenMovement?: (counterpartyUserId: string) => void;
  readonly participants: readonly SettlementDetailParticipantDto[];
  readonly status: string;
}) {
  const personalMovements = personalMovementsForUser(movements, currentUserId);
  const incomingMovement =
    personalMovements.find((movement) => movement.creditorUserId === currentUserId) ?? null;
  const outgoingMovement =
    personalMovements.find((movement) => movement.debtorUserId === currentUserId) ?? null;
  const incomingParticipant = incomingMovement
    ? participantById(participants, incomingMovement.debtorUserId, incomingMovement.debtorLabel)
    : null;
  const outgoingParticipant = outgoingMovement
    ? participantById(participants, outgoingMovement.creditorUserId, outgoingMovement.creditorLabel)
    : null;
  const amountStruckThrough = transactionAmountIsVoided({ status });
  const inactiveDetail = 'No hay movimiento para ti';
  const incomingDetail = incomingParticipant
    ? amountStruckThrough
      ? `${incomingParticipant.label} - no cambio el saldo`
      : status === 'executed'
        ? `${incomingParticipant.label} te pago`
        : `${incomingParticipant.label} te paga`
    : inactiveDetail;
  const outgoingDetail = outgoingParticipant
    ? amountStruckThrough
      ? `${outgoingParticipant.label} - no cambio el saldo`
      : status === 'executed'
        ? `Pagaste a ${outgoingParticipant.label}`
        : `A ${outgoingParticipant.label}`
    : inactiveDetail;

  return (
    <View style={styles.transactionChanges}>
      <TransactionChangeRow
        active={incomingMovement !== null}
        amountLabel={
          incomingMovement ? `+ ${formatCop(incomingMovement.amountMinor)}` : 'Sin cambio'
        }
        amountStruckThrough={amountStruckThrough}
        detail={incomingDetail}
        iconName="arrow-down-circle-outline"
        onPress={
          incomingMovement && onOpenMovement
            ? () => onOpenMovement(incomingMovement.debtorUserId)
            : undefined
        }
        title={incomingMovement ? 'Recibes' : 'No recibes'}
        tone="success"
      />
      <TransactionChangeRow
        active={outgoingMovement !== null}
        amountLabel={
          outgoingMovement ? `- ${formatCop(outgoingMovement.amountMinor)}` : 'Sin cambio'
        }
        amountStruckThrough={amountStruckThrough}
        detail={outgoingDetail}
        iconName="arrow-up-circle-outline"
        onPress={
          outgoingMovement && onOpenMovement
            ? () => onOpenMovement(outgoingMovement.creditorUserId)
            : undefined
        }
        title={outgoingMovement ? 'Pagas' : 'No pagas'}
        tone="warning"
      />
    </View>
  );
}
