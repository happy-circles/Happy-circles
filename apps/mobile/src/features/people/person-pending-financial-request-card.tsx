import type { ActivityItemDto } from '@happy-circles/application';
import { Alert } from 'react-native';

import { PendingFinancialRequestCard } from '@/components/pending-financial-request-card';
import * as appHaptics from '@/lib/app-haptics';
import {
  buildFinancialRequestPendingContent,
  type PendingActionKey,
} from './person-detail-helpers';

export function confirmPendingAction(input: {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}) {
  appHaptics.triggerAppSelectionHaptic();
  Alert.alert(input.title, input.message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: input.confirmLabel, style: 'destructive', onPress: input.onConfirm },
  ]);
}

export function PersonPendingFinancialRequestCard(input: {
  readonly item: ActivityItemDto;
  readonly actorAvatarUrl: string | null;
  readonly counterpartyName: string;
  readonly busyKey: string | null;
  readonly focused: boolean;
  readonly unread: boolean;
  readonly expanded: boolean;
  readonly onAction: (action: PendingActionKey) => void;
  readonly onCorrection: (mode: 'correction' | 'sender_correction') => void;
  readonly onToggle: () => void;
}) {
  const { item, busyKey, onAction } = input;
  const content = buildFinancialRequestPendingContent(item);

  return (
    <PendingFinancialRequestCard
      actorAvatarUrl={input.actorAvatarUrl}
      amountMinor={item.amountMinor ?? 0}
      amountTone={item.tone === 'positive' || item.tone === 'negative' ? item.tone : 'neutral'}
      busyAccept={busyKey === `${item.id}:accept`}
      busyReject={busyKey === `${item.id}:reject`}
      busyCancel={busyKey === `${item.id}:cancel`}
      actionsDisabled={busyKey !== null}
      createdByCurrentUser={item.createdByCurrentUser}
      requestKind={item.requestKind}
      counterpartyName={input.counterpartyName}
      category={item.category}
      createdAtLabel={content.createdAtLabel}
      createdByLabel={content.createdByLabel}
      description={content.detail}
      focused={input.focused}
      historySteps={item.pendingHistorySteps}
      isExpanded={input.expanded}
      onAccept={busyKey ? undefined : () => onAction('accept')}
      onReject={
        busyKey
          ? undefined
          : () =>
              confirmPendingAction({
                title: 'No aceptar',
                message: 'No se aplicara este movimiento.',
                confirmLabel: 'No aceptar',
                onConfirm: () => onAction('reject'),
              })
      }
      onToggleAmendment={busyKey ? undefined : () => input.onCorrection('correction')}
      onEdit={busyKey ? undefined : () => input.onCorrection('sender_correction')}
      onCancel={
        busyKey
          ? undefined
          : () =>
              confirmPendingAction({
                title: 'Cancelar solicitud',
                message: 'No se aplicará este movimiento. La conversación quedará en el historial.',
                confirmLabel: 'Cancelar solicitud',
                onConfirm: () => onAction('cancel'),
              })
      }
      onToggle={input.onToggle}
      responseState={item.status === 'requires_you' ? 'requires_you' : 'waiting_other_side'}
      title={item.title}
      unread={input.unread}
    />
  );
}
