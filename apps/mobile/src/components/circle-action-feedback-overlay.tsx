import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import {
  HappyCircleRing,
  happyCircleDecisionColor,
  type HappyCircleDecision,
  type HappyCircleRingParticipant,
} from '@/components/happy-circle-ring';
import type { ActionFeedbackVariant } from '@/lib/action-feedback';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export type CircleActionFeedbackAction = 'approve' | 'execute';

export interface CircleActionFeedbackOverlayProps {
  readonly action: CircleActionFeedbackAction;
  readonly amountLabel?: string | null;
  readonly message?: string;
  readonly participants: readonly HappyCircleRingParticipant[];
  readonly title?: string;
  readonly variant?: ActionFeedbackVariant;
  readonly visible: boolean;
}

interface CircleFeedbackPhase {
  readonly centerLabel: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly message: string;
  readonly title: string;
}

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const ORBIT_DURATION_MS = 5200;
const PHASE_DURATION_MS = 1050;

const APPROVE_PHASES: readonly CircleFeedbackPhase[] = [
  {
    centerLabel: 'tu nodo',
    icon: 'radio-button-on-outline',
    message: 'Tu aprobación afecta el cálculo de todos.',
    title: 'Tu aprobación entra al Circle',
  },
  {
    centerLabel: 'saldo vivo',
    icon: 'shield-checkmark-outline',
    message: 'Revisamos que el balance siga conectado antes de sellarlo.',
    title: 'Validando saldos vivos',
  },
  {
    centerLabel: 'anillo',
    icon: 'sync-outline',
    message: 'Si era la última aprobación, el Circle se cierra ahora.',
    title: 'Actualizando el anillo',
  },
  {
    centerLabel: 'resultado',
    icon: 'sparkles-outline',
    message: 'Historial, notificaciones y recompensa quedan sincronizados.',
    title: 'Preparando resultado',
  },
];

const EXECUTE_PHASES: readonly CircleFeedbackPhase[] = [
  {
    centerLabel: 'circle',
    icon: 'checkmark-done-circle-outline',
    message: 'Unimos todas las aprobaciones en un solo cierre.',
    title: 'Cerrando Circle',
  },
  {
    centerLabel: 'historial',
    icon: 'git-compare-outline',
    message: 'Los movimientos se escriben como una historia confirmada.',
    title: 'Escribiendo movimientos',
  },
  {
    centerLabel: 'tesoro',
    icon: 'gift-outline',
    message: 'La recompensa queda lista cuando el cierre termina.',
    title: 'Liberando recompensa',
  },
];

const FALLBACK_PARTICIPANTS: readonly HappyCircleRingParticipant[] = [
  { decision: 'pending', label: 'Tú', userId: 'circle-feedback:self' },
  { decision: 'pending', label: 'Happy', userId: 'circle-feedback:one' },
  { decision: 'pending', label: 'Happy', userId: 'circle-feedback:two' },
  { decision: 'pending', label: 'Happy', userId: 'circle-feedback:three' },
  { decision: 'pending', label: 'Happy', userId: 'circle-feedback:four' },
];

function resultCopy(input: {
  readonly action: CircleActionFeedbackAction;
  readonly message?: string;
  readonly title?: string;
  readonly variant: ActionFeedbackVariant;
}) {
  if (input.variant === 'loading') {
    return null;
  }

  if (input.variant === 'danger') {
    return {
      centerLabel: 'revisar',
      icon: 'alert-circle-outline' as keyof typeof Ionicons.glyphMap,
      message: input.message ?? 'El Circle no alcanzo a cerrarse. Intenta nuevamente.',
      title: input.title ?? 'No se pudo',
    };
  }

  return {
    centerLabel: input.action === 'execute' ? 'cerrado' : 'aprobado',
    icon: 'checkmark-circle-outline' as keyof typeof Ionicons.glyphMap,
    message:
      input.message ??
      (input.action === 'execute' ? 'Circle cerrado y sincronizado.' : 'Decision guardada.'),
    title: input.title ?? (input.action === 'execute' ? 'Circle cerrado' : 'Circle aprobado'),
  };
}

function phaseParticipants(input: {
  readonly action: CircleActionFeedbackAction;
  readonly participants: readonly HappyCircleRingParticipant[];
  readonly phaseIndex: number;
  readonly variant: ActionFeedbackVariant;
}): readonly HappyCircleRingParticipant[] {
  const baseline = input.participants.length > 0 ? input.participants : FALLBACK_PARTICIPANTS;
  const normalized = baseline.map((participant) => ({ ...participant }));

  if (input.variant === 'success') {
    return normalized.map((participant) => ({ ...participant, decision: 'approved' }));
  }

  if (input.variant === 'danger') {
    return normalized.map((participant, index) => ({
      ...participant,
      decision: index === 0 ? 'rejected' : participant.decision,
    }));
  }

  if (input.action === 'execute') {
    return normalized.map((participant) => ({ ...participant, decision: 'approved' }));
  }

  return normalized.map((participant, index) => {
    if (index !== 0) {
      return participant;
    }

    const decision: HappyCircleDecision = input.phaseIndex > 0 ? 'approved' : 'pending';
    return { ...participant, decision };
  });
}

export function CircleActionFeedbackOverlay({
  action,
  amountLabel,
  message,
  participants,
  title,
  variant = 'loading',
  visible,
}: CircleActionFeedbackOverlayProps) {
  const activeTheme = useAppTheme();
  const [mounted, setMounted] = useState(visible);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardScale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const cardTranslateY = useRef(new Animated.Value(visible ? 0 : 10)).current;
  const orbitProgress = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const phases = action === 'execute' ? EXECUTE_PHASES : APPROVE_PHASES;
  const phase = phases[phaseIndex % phases.length] ?? phases[0];
  const copy = resultCopy({ action, message, title, variant }) ?? phase;
  const statusColor =
    variant === 'danger'
      ? activeTheme.colors.danger
      : variant === 'success'
        ? activeTheme.colors.success
        : action === 'execute'
          ? activeTheme.colors.treasure
          : activeTheme.colors.cycle;
  const centerLabel = amountLabel ?? copy.centerLabel;
  const centerSubLabel = copy.centerLabel;
  const progressParticipants = useMemo(
    () => phaseParticipants({ action, participants, phaseIndex, variant }),
    [action, participants, phaseIndex, variant],
  );
  const orbitRotation = orbitProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const nodeCounterRotation = orbitProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  useEffect(() => {
    if (!visible || variant !== 'loading') {
      return;
    }

    setPhaseIndex(0);
    const interval = setInterval(() => {
      setPhaseIndex((current) => (current + 1) % phases.length);
    }, PHASE_DURATION_MS);

    return () => {
      clearInterval(interval);
    };
  }, [action, phases.length, variant, visible]);

  useEffect(() => {
    if (!visible || variant !== 'loading') {
      orbitProgress.stopAnimation();
      pulseScale.stopAnimation();
      return;
    }

    orbitProgress.setValue(0);
    const orbitAnimation = Animated.loop(
      Animated.timing(orbitProgress, {
        duration: ORBIT_DURATION_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          duration: 760,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1.035,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulseScale, {
          duration: 760,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
      ]),
    );

    orbitAnimation.start();
    pulseAnimation.start();

    return () => {
      orbitAnimation.stop();
      pulseAnimation.stop();
    };
  }, [orbitProgress, pulseScale, variant, visible]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      cardScale.setValue(0.96);
      cardTranslateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.spring(cardScale, {
          damping: 17,
          mass: 0.8,
          stiffness: 190,
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(cardTranslateY, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        duration: 140,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardScale, {
        duration: 140,
        easing: Easing.in(Easing.cubic),
        toValue: 0.97,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardTranslateY, {
        duration: 140,
        easing: Easing.in(Easing.cubic),
        toValue: 8,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [cardScale, cardTranslateY, opacity, visible]);

  if (!mounted) {
    return null;
  }

  return (
    <Modal animationType="none" statusBarTranslucent transparent visible={mounted}>
      <Animated.View style={[styles.scrim, { backgroundColor: activeTheme.colors.scrim, opacity }]}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: activeTheme.colors.surface,
              borderColor: activeTheme.colors.border,
              ...activeTheme.shadow.floating,
              transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            },
          ]}
        >
          <View style={styles.stage}>
            <Animated.View
              style={[
                styles.ringPulse,
                {
                  backgroundColor: `${statusColor}10`,
                  borderColor: `${statusColor}22`,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <HappyCircleRing
              animatePendingFaces={variant === 'loading'}
              centerColor={statusColor}
              centerLabel={centerLabel}
              centerSubLabel={centerSubLabel}
              decisions={progressParticipants}
              nodeCounterRotation={variant === 'loading' ? nodeCounterRotation : undefined}
              orbitRotation={variant === 'loading' ? orbitRotation : undefined}
              ringSize={220}
              showLabels={false}
              style={styles.ring}
            />
          </View>

          <View style={styles.copy}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: `${statusColor}12`,
                  borderColor: `${statusColor}24`,
                },
              ]}
            >
              <Ionicons color={statusColor} name={copy.icon} size={15} />
              <AppText numberOfLines={1} style={[styles.statusText, { color: statusColor }]}>
                {variant === 'loading' ? 'Circle en movimiento' : copy.centerLabel}
              </AppText>
            </View>
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={2}
              style={[styles.title, { color: activeTheme.colors.text }]}
            >
              {copy.title}
            </AppText>
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={2}
              style={[
                styles.message,
                {
                  color:
                    variant === 'danger' ? activeTheme.colors.danger : activeTheme.colors.textMuted,
                },
              ]}
            >
              {copy.message}
            </AppText>
          </View>

          <View style={styles.progressRow}>
            {phases.map((item, index) => {
              const isActive = variant !== 'loading' || index <= phaseIndex;
              const color =
                variant === 'danger'
                  ? happyCircleDecisionColor('rejected')
                  : isActive
                    ? statusColor
                    : activeTheme.colors.border;

              return (
                <View
                  key={item.title}
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor: color,
                      opacity: isActive ? 1 : 0.72,
                    },
                  ]}
                />
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: 360,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    width: '100%',
  },
  copy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: '100%',
  },
  message: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    height: 6,
    width: '100%',
  },
  progressSegment: {
    borderRadius: theme.radius.pill,
    flex: 1,
  },
  ring: {
    marginRight: 0,
  },
  ringPulse: {
    borderRadius: 132,
    borderWidth: 1,
    height: 264,
    position: 'absolute',
    width: 264,
  },
  stage: {
    alignItems: 'center',
    height: 246,
    justifyContent: 'center',
    width: '100%',
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: theme.spacing.sm,
  },
  statusText: {
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: theme.typography.title3,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
});
