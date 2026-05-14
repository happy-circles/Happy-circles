import { Link, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useMemo, useState } from 'react';

import type { ActiveSettlementPreviewDto } from '@happy-circles/application';

import { CardPressable } from '@/components/card-shell';
import { CircleActionFeedbackOverlay } from '@/components/circle-action-feedback-overlay';
import {
  HappyCircleRing,
  type HappyCircleDecision,
  type HappyCircleRingParticipant,
  happyCircleDecisionColor,
} from '@/components/happy-circle-ring';
import { LiquidGlassDisc } from '@/components/liquid-glass-disc';
import { PrimaryAction } from '@/components/primary-action';
import { StateAuraLayer, stateAuraVariantFromTone } from '@/components/state-aura-layer';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import {
  triggerAppActionHaptic,
  triggerAppErrorHaptic,
  triggerAppSelectionHaptic,
  triggerAppWarningHaptic,
} from '@/lib/app-haptics';
import { cardStateColor, cardStateIntentFromTone } from '@/lib/card-language';
import { resolveHappyCirclePresentation } from '@/lib/happy-circle-presentation';
import { showBlockedActionAlert, useActionFeedbackOverlay } from '@/lib/action-feedback';
import { showGlobalFeedback } from '@/lib/global-feedback';
import { useApproveSettlementMutation, useRejectSettlementMutation } from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

const SHOWCASE_CARD_HEIGHT = 528;
const SHOWCASE_BODY_HEIGHT = 424;
const SHOWCASE_FOOTER_HEIGHT = SHOWCASE_CARD_HEIGHT - SHOWCASE_BODY_HEIGHT;
const SHOWCASE_HEADER_TOP = 28;
const SHOWCASE_RING_TOP = 84;
const SHOWCASE_PILLS_TOP = 404;
const SHOWCASE_PILLS_WIDTH = 260;

function ApprovalDots({
  decisions,
}: {
  readonly decisions: readonly { readonly decision: 'approved' | 'pending' | 'rejected' }[];
}) {
  return (
    <View style={styles.dotsRow}>
      {decisions.map((participant, index) => (
        <View
          key={index}
          style={[styles.dot, { backgroundColor: happyCircleDecisionColor(participant.decision) }]}
        />
      ))}
    </View>
  );
}

function CircleStatusIcon({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: string | null | undefined;
}) {
  const activeTheme = useAppTheme();
  const icon: keyof typeof Ionicons.glyphMap =
    tone === 'success'
      ? 'checkmark-done-circle-outline'
      : tone === 'danger'
        ? 'close-circle-outline'
        : tone === 'warning'
          ? 'alert-circle-outline'
          : 'radio-button-on-outline';
  const color =
    tone === 'success'
      ? activeTheme.colors.success
      : tone === 'danger'
        ? activeTheme.colors.danger
        : tone === 'warning'
          ? activeTheme.colors.warning
          : activeTheme.colors.cycle;

  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[styles.statusIcon, { backgroundColor: `${color}12`, borderColor: `${color}28` }]}
    >
      <Ionicons color={color} name={icon} size={18} />
    </View>
  );
}

function anonymousCircleParticipant(
  key: string,
  decision: HappyCircleDecision,
): HappyCircleRingParticipant {
  return {
    decision,
    label: 'Happy',
    userId: key,
  };
}

function circleCardDecision(
  proposal: ActiveSettlementPreviewDto,
  userId: string | null | undefined,
  fallbackDecision: HappyCircleDecision,
): HappyCircleDecision {
  return (
    proposal.participantDecisions.find((participant) => participant.userId === userId)?.decision ??
    fallbackDecision
  );
}

function directCircleCardParticipants(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null | undefined,
  fallbackDecision: HappyCircleDecision,
): readonly HappyCircleRingParticipant[] {
  const currentParticipant =
    proposal.participantDecisions.find((participant) => participant.userId === currentUserId) ??
    anonymousCircleParticipant('happy-circle:self', fallbackDecision);
  const outgoing = proposal.outgoingConnection;
  const incoming = proposal.incomingConnection;

  return [
    { ...currentParticipant, label: 'Tu' },
    outgoing
      ? {
          decision: circleCardDecision(proposal, outgoing.userId, fallbackDecision),
          label: outgoing.label,
          userId: outgoing.userId,
        }
      : anonymousCircleParticipant('happy-circle:outgoing', fallbackDecision),
    anonymousCircleParticipant('happy-circle:hidden:right', fallbackDecision),
    anonymousCircleParticipant('happy-circle:hidden:left', fallbackDecision),
    incoming
      ? {
          decision: circleCardDecision(proposal, incoming.userId, fallbackDecision),
          label: incoming.label,
          userId: incoming.userId,
        }
      : anonymousCircleParticipant('happy-circle:incoming', fallbackDecision),
  ];
}

function readResultStatus(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const status = (value as Record<string, unknown>)['status'];
  return typeof status === 'string' ? status : null;
}

function readNestedStatus(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return readResultStatus((value as Record<string, unknown>)[key]);
}

export interface HappyCircleCardProps {
  readonly proposal: ActiveSettlementPreviewDto;
  readonly showcaseRingSize?: number;
  readonly unread?: boolean;
  readonly variant?: 'full' | 'compact' | 'showcase';
}

export function HappyCircleCard({
  proposal,
  showcaseRingSize,
  unread = false,
  variant = 'full',
}: HappyCircleCardProps) {
  const activeTheme = useAppTheme();
  const router = useRouter();
  const session = useSession();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const actionFeedback = useActionFeedbackOverlay();
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);

  const isCompact = variant === 'compact';
  const isShowcase = variant === 'showcase';
  const ringSize = isShowcase ? (showcaseRingSize ?? 260) : isCompact ? 166 : 220;
  const amountLabel = formatCop(proposal.personalAmountMinor);
  const approvedCount = proposal.participantCount - proposal.approvalsPending;
  const myDecision = proposal.participantDecisions.find(
    (p) => p.userId === session.userId,
  )?.decision;
  const presentation = resolveHappyCirclePresentation({
    approvalsPending: proposal.approvalsPending,
    myDecision,
    status: proposal.status,
  });
  const canDecide = presentation.actionability === 'can_decide';
  const circleIntent = cardStateIntentFromTone(presentation.tone ?? 'neutral');
  const cycleColor = activeTheme.colors.cycle;
  const detailHref = `/settlements/${proposal.proposalId}` as Href;
  const stateColor = cardStateColor(circleIntent, presentation.tone ?? 'neutral');
  const circleGlowColor = isShowcase ? cycleColor : stateColor;
  const auraSize = unread
    ? isShowcase
      ? 'hero'
      : 'large'
    : isShowcase
      ? 'large'
      : isCompact
        ? 'compact'
        : 'regular';

  const orderedDecisions = useMemo(() => {
    return directCircleCardParticipants(proposal, session.userId, myDecision ?? 'pending');
  }, [myDecision, proposal, session.userId]);
  async function handleAction(action: 'approve' | 'reject') {
    setBusyAction(action);
    actionFeedback.clear();

    try {
      if (action === 'approve') {
        const response = await actionFeedback.runBlockingAction('approveSettlement', () =>
          approveSettlement.mutateAsync(proposal.proposalId),
        );
        const nextStatus = readResultStatus(response);

        if (nextStatus === 'executed') {
          const nextAutoCycleStatus = readNestedStatus(response, 'nextAutoCycleJob');

          await actionFeedback.showResult({
            message:
              nextAutoCycleStatus === 'queued'
                ? 'Tesoro listo y otro Circle en camino'
                : 'Tesoro listo en el detalle',
            title: 'Circle completado',
            variant: 'success',
          });
        } else {
          await actionFeedback.showResult({
            message: 'Decisión guardada',
            title: 'Listo',
            variant: 'success',
          });
        }
      } else {
        await rejectSettlement.mutateAsync(proposal.proposalId);
        triggerAppWarningHaptic();
        showGlobalFeedback({
          message: 'No se aplicará ningún movimiento desde este Circle.',
          title: 'Happy Circle no aprobado',
          tone: 'neutral',
        });
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo completar la acción.';
      if (
        showBlockedActionAlert(nextMessage, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            displayName: session.profile?.display_name ?? null,
            avatarPath: session.profile?.avatar_path ?? null,
            phoneE164: session.profile?.phone_e164 ?? null,
          },
        })
      ) {
        return;
      }

      if (action === 'approve') {
        await actionFeedback.showResult({
          message: 'Intenta nuevamente',
          title: 'No se pudo',
          variant: 'danger',
        });
      } else {
        triggerAppErrorHaptic();
        Alert.alert('No se pudo completar', nextMessage);
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SurfaceCard
      padding="none"
      style={[
        styles.card,
        { borderLeftColor: cycleColor },
        isCompact ? styles.cardCompact : null,
        isShowcase ? styles.cardShowcase : null,
      ]}
      underlay={
        <StateAuraLayer
          size={auraSize}
          variant={unread ? 'newCircle' : stateAuraVariantFromTone(presentation.tone)}
        />
      }
      variant="elevated"
    >
      <Link href={detailHref} asChild>
        <CardPressable
          haptic="selection"
          hapticTrigger="pressIn"
          style={[
            styles.cardPressable,
            isCompact ? styles.cardPressableCompact : null,
            isShowcase ? styles.cardPressableShowcase : null,
          ]}
        >
          {isShowcase ? null : (
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderCopy}>
                <View style={styles.brandRow}>
                  <Ionicons color={cycleColor} name="happy-outline" size={18} />
                  <AppText style={[styles.brandLabel, { color: cycleColor }]}>Happy Circle</AppText>
                </View>
                <CircleStatusIcon label={presentation.label} tone={presentation.tone} />
              </View>
            </View>
          )}

          {isShowcase ? (
            <View style={styles.showcaseBody}>
              <View style={styles.showcaseSummary}>
                <View style={styles.showcaseHeader}>
                  <AppText
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    style={[styles.showcaseTitle, { color: activeTheme.colors.text }]}
                  >
                    Happy Circle
                  </AppText>
                  <View style={styles.showcaseStatusSlot}>
                    <CircleStatusIcon label={presentation.label} tone={presentation.tone} />
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.ringHaloWrap,
                  styles.showcaseRingSlot,
                  {
                    height: ringSize + 56,
                    maxWidth: ringSize + 56,
                    width: '100%',
                  },
                ]}
              >
                <HappyCircleRing
                  centerColor={cycleColor}
                  centerLabel={amountLabel}
                  centerSubLabel="a solucionar"
                  decisions={orderedDecisions}
                  ringSize={ringSize}
                  style={styles.showcaseRing}
                />
              </View>

              <View style={styles.showcasePillsRow}>
                {orderedDecisions.map((participant) => (
                  <View
                    key={participant.userId}
                    style={[
                      styles.showcaseProgressPill,
                      { backgroundColor: happyCircleDecisionColor(participant.decision) },
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.body, isCompact ? styles.bodyCompact : null]}>
              <View style={styles.metricsColumn}>
                <View style={styles.metricBlock}>
                  <AppText style={[styles.metricEyebrow, { color: activeTheme.colors.textMuted }]}>
                    Evitas mover
                  </AppText>
                  <AppText
                    style={[
                      styles.metricAmount,
                      { color: activeTheme.colors.text },
                      isCompact ? styles.metricAmountCompact : null,
                    ]}
                  >
                    {amountLabel}
                  </AppText>
                </View>
                <AppText style={[styles.approvalSummary, { color: activeTheme.colors.success }]}>
                  {approvedCount}/{proposal.participantCount} aprobadas
                </AppText>
                <AppText
                  numberOfLines={2}
                  style={[styles.stateSummary, { color: activeTheme.colors.textMuted }]}
                >
                  {presentation.summary}
                </AppText>

                <View style={styles.approvalBlock}>
                  <ApprovalDots decisions={orderedDecisions} />
                </View>
              </View>

              <View
                style={[
                  styles.ringHaloWrap,
                  {
                    height: ringSize + 16,
                    width: ringSize + 16,
                  },
                ]}
              >
                <LiquidGlassDisc
                  color={circleGlowColor}
                  intensity={canDecide ? 'strong' : 'soft'}
                  intent={circleIntent}
                  size={ringSize + 16}
                  tone={presentation.tone}
                />
                <HappyCircleRing
                  centerColor={cycleColor}
                  centerLabel={amountLabel}
                  centerSubLabel="a solucionar"
                  decisions={orderedDecisions}
                  ringSize={ringSize}
                />
              </View>
            </View>
          )}
        </CardPressable>
      </Link>

      {isShowcase || canDecide ? (
        <View
          style={[
            styles.actionsFooter,
            { borderTopColor: activeTheme.colors.border },
            isShowcase ? styles.actionsFooterShowcase : null,
          ]}
        >
          {isShowcase ? (
            <>
              {canDecide ? (
                <View style={styles.showcaseActionsRow}>
                  <Pressable
                    accessibilityLabel="Rechazar Happy Circle"
                    accessibilityRole="button"
                    disabled={busyAction !== null}
                    onPressIn={busyAction === null ? triggerAppWarningHaptic : undefined}
                    onPress={() => {
                      Alert.alert(
                        'Seguro quieres rechazar este Happy Circle?',
                        'Si rechazas, este Circle se cerrara para todos. No se aplicara ningun movimiento.',
                        [
                          {
                            text: 'Volver',
                            style: 'cancel',
                          },
                          {
                            text: 'Rechazar Circle',
                            style: 'destructive',
                            onPress: () => void handleAction('reject'),
                          },
                        ],
                      );
                    }}
                    style={({ pressed }) => [
                      styles.iconActionButton,
                      styles.iconActionButtonGhost,
                      {
                        backgroundColor: `${activeTheme.colors.danger}12`,
                        borderColor: `${activeTheme.colors.danger}2E`,
                      },
                      pressed ? styles.iconActionButtonPressed : null,
                      busyAction !== null ? styles.iconActionButtonDisabled : null,
                    ]}
                  >
                    <Ionicons
                      color={activeTheme.colors.danger}
                      name={busyAction === 'reject' ? 'hourglass-outline' : 'close'}
                      size={20}
                    />
                    <AppText style={[styles.iconActionLabel, { color: activeTheme.colors.danger }]}>
                      Rechazar
                    </AppText>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Aprobar Happy Circle"
                    accessibilityRole="button"
                    disabled={busyAction !== null}
                    onPressIn={busyAction === null ? triggerAppActionHaptic : undefined}
                    onPress={() => void handleAction('approve')}
                    style={({ pressed }) => [
                      styles.iconActionButton,
                      {
                        backgroundColor: cycleColor,
                        borderColor: cycleColor,
                        ...activeTheme.shadow.card,
                      },
                      pressed ? styles.iconActionButtonPressed : null,
                      busyAction !== null ? styles.iconActionButtonDisabled : null,
                    ]}
                  >
                    <Ionicons
                      color={activeTheme.colors.white}
                      name={busyAction === 'approve' ? 'hourglass-outline' : 'checkmark'}
                      size={20}
                    />
                    <AppText style={[styles.iconActionLabel, { color: activeTheme.colors.white }]}>
                      Aprobar
                    </AppText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.showcaseStatusLane}>
                  <View
                    style={[
                      styles.showcaseStatePill,
                      {
                        backgroundColor: `${stateColor}12`,
                        borderColor: `${stateColor}24`,
                      },
                    ]}
                  >
                    <AppText
                      numberOfLines={1}
                      style={[styles.showcaseStateText, { color: stateColor }]}
                    >
                      {presentation.label}
                    </AppText>
                  </View>
                </View>
              )}
              <Pressable
                accessibilityLabel="Ver detalle del Happy Circle"
                accessibilityRole="button"
                onPress={() => {
                  pushRoute(router, detailHref);
                }}
                onPressIn={triggerAppSelectionHaptic}
                style={({ pressed }) => [
                  styles.detailCta,
                  pressed ? styles.detailCtaPressed : null,
                ]}
              >
                <AppText numberOfLines={1} style={[styles.detailCtaText, { color: cycleColor }]}>
                  Ver detalle
                </AppText>
                <Ionicons color={cycleColor} name="chevron-forward" size={14} />
              </Pressable>
            </>
          ) : (
            <>
              <PrimaryAction
                color={cycleColor}
                compact
                disabled={busyAction !== null}
                fullWidth={false}
                icon="checkmark"
                label={busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
                loading={busyAction === 'approve'}
                onPress={() => {
                  triggerAppActionHaptic();
                  void handleAction('approve');
                }}
                style={styles.actionButton}
              />
              <PrimaryAction
                compact
                disabled={busyAction !== null}
                fullWidth={false}
                icon="close"
                label={busyAction === 'reject' ? 'Rechazando...' : 'No aprobar'}
                loading={busyAction === 'reject'}
                onPress={() => {
                  triggerAppWarningHaptic();
                  Alert.alert(
                    '¿Seguro quieres rechazar este Happy Circle?',
                    'Si rechazas, este Circle se cerrará para todos. No se aplicará ningún movimiento.',
                    [
                      {
                        text: 'Volver',
                        style: 'cancel',
                      },
                      {
                        text: 'Rechazar Circle',
                        style: 'destructive',
                        onPress: () => void handleAction('reject'),
                      },
                    ],
                  );
                }}
                variant="ghost"
                style={styles.actionButton}
              />
            </>
          )}
        </View>
      ) : null}
      <CircleActionFeedbackOverlay
        action="approve"
        amountLabel={amountLabel}
        message={actionFeedback.overlayProps.message}
        participants={orderedDecisions}
        title={actionFeedback.overlayProps.title}
        variant={actionFeedback.overlayProps.variant}
        visible={actionFeedback.overlayProps.visible && busyAction === 'approve'}
      />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftColor: theme.colors.cycle,
    borderLeftWidth: 3,
    overflow: 'visible',
  },
  cardCompact: {
    borderRadius: theme.radius.medium,
  },
  cardShowcase: {
    borderLeftWidth: 0,
    borderRadius: theme.radius.large,
    gap: 0,
    height: SHOWCASE_CARD_HEIGHT,
  },
  cardPressable: {
    gap: theme.spacing.md,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    position: 'relative',
  },
  cardPressableCompact: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  cardPressableShowcase: {
    gap: theme.spacing.sm,
    height: SHOWCASE_BODY_HEIGHT,
    paddingBottom: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 0,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  cardHeaderCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.small,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  brandLabel: {
    color: theme.colors.cycle,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  body: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    zIndex: 2,
  },
  bodyCompact: {
    alignItems: 'flex-start',
  },
  showcaseBody: {
    alignItems: 'center',
    height: SHOWCASE_BODY_HEIGHT,
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
  showcaseSummary: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: SHOWCASE_HEADER_TOP,
    width: '100%',
  },
  showcaseHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 58,
    position: 'relative',
    width: '100%',
  },
  showcaseStatusSlot: {
    position: 'absolute',
    right: theme.spacing.xxl,
    top: theme.spacing.xs,
  },
  showcaseTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
  showcaseRing: {
    marginRight: 0,
  },
  ringHaloWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  showcaseRingSlot: {
    alignSelf: 'center',
    position: 'absolute',
    top: SHOWCASE_RING_TOP,
  },
  showcasePillsRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    maxWidth: SHOWCASE_PILLS_WIDTH,
    position: 'absolute',
    top: SHOWCASE_PILLS_TOP,
    width: SHOWCASE_PILLS_WIDTH,
  },
  showcaseProgressPill: {
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 8,
    minWidth: 0,
  },
  detailCta: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    justifyContent: 'center',
    minHeight: 22,
    minWidth: 104,
  },
  detailCtaPressed: {
    opacity: 0.72,
  },
  detailCtaText: {
    color: theme.colors.cycle,
    flexShrink: 0,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
    textAlign: 'center',
  },
  metricsColumn: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  metricBlock: {
    gap: 2,
  },
  metricEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  metricAmount: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  metricAmountCompact: {
    fontSize: theme.typography.title3,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  approvalSummary: {
    color: theme.colors.success,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  approvalBlock: {
    gap: 4,
  },
  stateSummary: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    borderRadius: 999,
    height: 6,
    width: 24,
  },

  actionsFooter: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  actionsFooterShowcase: {
    alignItems: 'stretch',
    borderTopWidth: 0,
    bottom: 0,
    flexDirection: 'column',
    gap: theme.spacing.xxs,
    height: SHOWCASE_FOOTER_HEIGHT,
    justifyContent: 'center',
    left: 0,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    position: 'absolute',
    right: 0,
    zIndex: 4,
  },
  showcaseActionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  showcaseStatusLane: {
    height: 46,
    justifyContent: 'center',
    width: '100%',
  },
  showcaseStatePill: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: 46,
    justifyContent: 'center',
    minWidth: 132,
    paddingHorizontal: theme.spacing.md,
  },
  showcaseStateText: {
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 16,
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
  },
  iconActionButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 46,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  iconActionButtonPrimary: {
    backgroundColor: theme.colors.cycle,
    borderColor: theme.colors.cycle,
    borderWidth: 1,
    ...theme.shadow.card,
  },
  iconActionButtonGhost: {
    backgroundColor: `${theme.colors.danger}12`,
    borderColor: `${theme.colors.danger}2E`,
    borderWidth: 1,
  },
  iconActionLabel: {
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 18,
  },
  iconActionLabelApprove: {
    color: theme.colors.white,
  },
  iconActionLabelReject: {
    color: theme.colors.danger,
  },
  iconActionButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  iconActionButtonDisabled: {
    opacity: 0.55,
  },
});
