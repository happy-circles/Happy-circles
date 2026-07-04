import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import type { ActionFeedbackVariant } from '@/lib/action-feedback';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export type ContactActionFeedbackMode = 'prepare' | 'share';

export interface ContactActionFeedbackOverlayProps {
  readonly alias?: string | null;
  readonly message?: string;
  readonly mode?: ContactActionFeedbackMode;
  readonly presentation?: 'modal' | 'inline';
  readonly title?: string;
  readonly variant?: ActionFeedbackVariant;
  readonly visible: boolean;
}

interface ContactFeedbackPhase {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly message: string;
  readonly title: string;
}

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const PHASE_DURATION_MS = 980;

const PREPARE_PHASES: readonly ContactFeedbackPhase[] = [
  {
    icon: 'search-outline',
    label: 'revisando',
    message: 'Validamos el numero antes de enviar algo.',
    title: 'Revisando contacto',
  },
  {
    icon: 'person-add-outline',
    label: 'persona',
    message: 'Si ya usa Happy Circles, preparamos la solicitud de amistad.',
    title: 'Preparando solicitud',
  },
  {
    icon: 'key-outline',
    label: 'acceso',
    message: 'Si necesita cuenta, creamos un enlace privado para entrar.',
    title: 'Creando acceso privado',
  },
  {
    icon: 'sync-outline',
    label: 'lista',
    message: 'Actualizamos Personas para que no tengas que repetir la accion.',
    title: 'Sincronizando tu lista',
  },
];

const SHARE_PHASES: readonly ContactFeedbackPhase[] = [
  {
    icon: 'paper-plane-outline',
    label: 'compartir',
    message: 'Tu telefono esta abriendo las opciones para enviar el acceso.',
    title: 'Abriendo compartir',
  },
  {
    icon: 'link-outline',
    label: 'enlace',
    message: 'Mantenemos el enlace listo si prefieres copiarlo o reenviarlo.',
    title: 'Preparando enlace',
  },
];

function resultCopy(input: {
  readonly alias?: string | null;
  readonly message?: string;
  readonly title?: string;
  readonly variant: ActionFeedbackVariant;
}): ContactFeedbackPhase | null {
  if (input.variant === 'loading') {
    return null;
  }

  if (input.variant === 'danger') {
    return {
      icon: 'alert-circle-outline',
      label: 'revisar',
      message: input.message ?? 'No se pudo completar la accion.',
      title: input.title ?? 'No se pudo',
    };
  }

  return {
    icon: 'checkmark-circle-outline',
    label: 'listo',
    message: input.message ?? `${input.alias ?? 'El contacto'} quedo actualizado.`,
    title: input.title ?? 'Listo',
  };
}

export function ContactActionFeedbackOverlay({
  alias,
  message,
  mode = 'prepare',
  presentation = 'modal',
  title,
  variant = 'loading',
  visible,
}: ContactActionFeedbackOverlayProps) {
  const activeTheme = useAppTheme();
  const [mounted, setMounted] = useState(visible);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardScale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const cardTranslateY = useRef(new Animated.Value(visible ? 0 : 10)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const phases = mode === 'share' ? SHARE_PHASES : PREPARE_PHASES;
  const phase = phases[phaseIndex % phases.length] ?? phases[0];
  const copy = resultCopy({ alias, message, title, variant }) ?? phase;
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
      setPhaseIndex((current) => (current + 1) % phases.length);
    }, PHASE_DURATION_MS);

    return () => {
      clearInterval(interval);
    };
  }, [mode, phases.length, variant, visible]);

  useEffect(() => {
    if (!visible || variant !== 'loading') {
      pulse.stopAnimation();
      return;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 720,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1.04,
          useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          duration: 720,
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

  const content = (
    <Animated.View
      style={[
        styles.scrim,
        presentation === 'inline' ? styles.inlineScrim : null,
        { backgroundColor: activeTheme.colors.scrim, opacity },
      ]}
    >
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
              styles.motionShell,
              {
                backgroundColor: activeTheme.colors.surface,
                borderColor: `${statusColor}32`,
              },
            ]}
          >
            <HappyCirclesMotion
              active={variant === 'loading'}
              color={statusColor}
              size={94}
              tone="mono"
              variant={variant === 'success' ? 'success' : 'loading'}
            />
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
            {message ?? copy.message}
          </AppText>
          {alias ? (
            <AppText numberOfLines={1} style={[styles.alias, { color: activeTheme.colors.text }]}>
              {alias}
            </AppText>
          ) : null}
        </View>

        <View style={styles.progressRow}>
          {phases.map((item, index) => {
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
  );

  if (presentation === 'inline') {
    return content;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={() => undefined}
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  alias: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 16,
    maxWidth: '100%',
    textAlign: 'center',
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
  halo: {
    borderRadius: 96,
    borderWidth: 1,
    height: 192,
    position: 'absolute',
    width: 192,
  },
  inlineScrim: {
    ...StyleSheet.absoluteFillObject,
    elevation: 30,
    zIndex: 30,
  },
  message: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  motionShell: {
    alignItems: 'center',
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    height: 128,
    justifyContent: 'center',
    position: 'relative',
    width: 128,
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
  stage: {
    alignItems: 'center',
    height: 198,
    justifyContent: 'center',
    width: '100%',
  },
  statusDot: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    bottom: 14,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
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
