import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { ActionFeedbackVariant } from '@/lib/action-feedback';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export interface AccountActionFeedbackOverlayProps {
  readonly message?: string;
  readonly title?: string;
  readonly variant?: ActionFeedbackVariant;
  readonly visible: boolean;
}

interface AccountFeedbackPhase {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly message: string;
  readonly title: string;
}

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const PHASE_DURATION_MS = 1050;

const DELETE_ACCOUNT_PHASES: readonly AccountFeedbackPhase[] = [
  {
    icon: 'shield-checkmark-outline',
    label: 'seguridad',
    message: 'Confirmamos que esta acción venga desde un dispositivo confiable.',
    title: 'Validando seguridad',
  },
  {
    icon: 'finger-print-outline',
    label: 'identidad',
    message: 'Pedimos una verificación extra antes de tocar tu cuenta.',
    title: 'Confirmando identidad',
  },
  {
    icon: 'lock-closed-outline',
    label: 'historial',
    message: 'Protegemos historial y saldos para que no pierdan consistencia.',
    title: 'Protegiendo el historial',
  },
  {
    icon: 'log-out-outline',
    label: 'salida',
    message: 'Cerramos la sesión cuando la cuenta queda anonimizada.',
    title: 'Cerrando sesión',
  },
];

function resultCopy(input: {
  readonly message?: string;
  readonly title?: string;
  readonly variant: ActionFeedbackVariant;
}): AccountFeedbackPhase | null {
  if (input.variant === 'loading') {
    return null;
  }

  if (input.variant === 'danger') {
    return {
      icon: 'alert-circle-outline',
      label: 'revisar',
      message: input.message ?? 'No se pudo completar la acción.',
      title: input.title ?? 'No se pudo',
    };
  }

  return {
    icon: 'checkmark-circle-outline',
    label: 'listo',
    message: input.message ?? 'La cuenta quedo actualizada.',
    title: input.title ?? 'Listo',
  };
}

export function AccountActionFeedbackOverlay({
  message,
  title,
  variant = 'loading',
  visible,
}: AccountActionFeedbackOverlayProps) {
  const activeTheme = useAppTheme();
  const [mounted, setMounted] = useState(visible);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardScale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const cardTranslateY = useRef(new Animated.Value(visible ? 0 : 10)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const phase = DELETE_ACCOUNT_PHASES[phaseIndex % DELETE_ACCOUNT_PHASES.length];
  const copy = resultCopy({ message, title, variant }) ?? phase;
  const statusColor =
    variant === 'danger'
      ? activeTheme.colors.danger
      : variant === 'success'
        ? activeTheme.colors.success
        : activeTheme.colors.primary;

  useEffect(() => {
    if (!visible || variant !== 'loading') {
      return;
    }

    setPhaseIndex(0);
    const interval = setInterval(() => {
      setPhaseIndex((current) => (current + 1) % DELETE_ACCOUNT_PHASES.length);
    }, PHASE_DURATION_MS);

    return () => {
      clearInterval(interval);
    };
  }, [variant, visible]);

  useEffect(() => {
    if (!visible || variant !== 'loading') {
      pulse.stopAnimation();
      return;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 760,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1.04,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          duration: 760,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
      ]),
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [pulse, variant, visible]);

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

  if (!mounted || !copy) {
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
                styles.halo,
                {
                  backgroundColor: `${statusColor}10`,
                  borderColor: `${statusColor}24`,
                  transform: [{ scale: pulse }],
                },
              ]}
            />
            <View
              style={[
                styles.shield,
                {
                  backgroundColor: activeTheme.colors.surface,
                  borderColor: `${statusColor}32`,
                },
              ]}
            >
              <Ionicons color={statusColor} name="shield-outline" size={40} />
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: statusColor,
                    borderColor: activeTheme.colors.surface,
                  },
                ]}
              >
                <Ionicons color={activeTheme.colors.white} name={copy.icon} size={15} />
              </View>
            </View>
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
                {copy.label}
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
            {DELETE_ACCOUNT_PHASES.map((item, index) => {
              const isActive = variant !== 'loading' || index <= phaseIndex;
              return (
                <View
                  key={item.title}
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor: isActive ? statusColor : activeTheme.colors.border,
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
  halo: {
    borderRadius: 92,
    borderWidth: 1,
    height: 184,
    position: 'absolute',
    width: 184,
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
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  shield: {
    alignItems: 'center',
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    height: 122,
    justifyContent: 'center',
    position: 'relative',
    width: 122,
  },
  stage: {
    alignItems: 'center',
    height: 188,
    justifyContent: 'center',
    width: '100%',
  },
  statusDot: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    bottom: 20,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    width: 34,
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
