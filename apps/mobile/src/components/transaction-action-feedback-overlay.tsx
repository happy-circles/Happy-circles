import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import type { ActionFeedbackVariant } from '@/lib/action-feedback';
import { directionVisual, type LedgerDirection } from '@/lib/direction-ui';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import { useAppTheme } from '@/providers/theme-provider';

export interface TransactionActionFeedbackOverlayProps {
  readonly amountLabel: string;
  readonly category: string;
  readonly direction: LedgerDirection;
  readonly isCorrection?: boolean;
  readonly message?: string;
  readonly personLabel?: string | null;
  readonly title?: string;
  readonly variant?: ActionFeedbackVariant;
  readonly visible: boolean;
}

interface TransactionFeedbackPhase {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly message: string;
  readonly title: string;
}

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const PHASE_DURATION_MS = 940;

const CREATE_PHASES: readonly TransactionFeedbackPhase[] = [
  {
    icon: 'receipt-outline',
    label: 'movimiento',
    message: 'Tomamos monto, persona y concepto como una sola intencion.',
    title: 'Armando el movimiento',
  },
  {
    icon: 'swap-horizontal-outline',
    label: 'saldo',
    message: 'El balance entre ustedes se prepara antes de tocar el historial.',
    title: 'Ubicando el saldo',
  },
  {
    icon: 'git-network-outline',
    label: 'circle',
    message: 'Revisamos si este registro puede conectar con un Happy Circle.',
    title: 'Buscando conexiones',
  },
  {
    icon: 'paper-plane-outline',
    label: 'pendiente',
    message: 'Queda listo para que la otra persona lo revise.',
    title: 'Enviando propuesta',
  },
];

const CORRECTION_PHASES: readonly TransactionFeedbackPhase[] = [
  {
    icon: 'create-outline',
    label: 'ajuste',
    message: 'Tomamos tu cambio sin borrar la historia anterior.',
    title: 'Armando correccion',
  },
  {
    icon: 'layers-outline',
    label: 'version',
    message: 'La nueva version queda conectada al movimiento original.',
    title: 'Reordenando el caso',
  },
  {
    icon: 'paper-plane-outline',
    label: 'pendiente',
    message: 'La correccion queda lista para revision.',
    title: 'Enviando correccion',
  },
];

function resultCopy(input: {
  readonly isCorrection: boolean;
  readonly message?: string;
  readonly title?: string;
  readonly variant: ActionFeedbackVariant;
}): TransactionFeedbackPhase | null {
  if (input.variant === 'loading') {
    return null;
  }

  if (input.variant === 'danger') {
    return {
      icon: 'alert-circle-outline',
      label: 'revisar',
      message: input.message ?? 'No alcanzo a guardarse. Intenta nuevamente.',
      title: input.title ?? 'No se pudo',
    };
  }

  return {
    icon: 'checkmark-circle-outline',
    label: input.isCorrection ? 'corregido' : 'creado',
    message:
      input.message ??
      (input.isCorrection ? 'La correccion quedo enviada.' : 'La propuesta quedo enviada.'),
    title: input.title ?? (input.isCorrection ? 'Correccion enviada' : 'Movimiento creado'),
  };
}

export function TransactionActionFeedbackOverlay({
  amountLabel,
  category,
  direction,
  isCorrection = false,
  message,
  personLabel,
  title,
  variant = 'loading',
  visible,
}: TransactionActionFeedbackOverlayProps) {
  const activeTheme = useAppTheme();
  const [mounted, setMounted] = useState(visible);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardScale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const cardTranslateY = useRef(new Animated.Value(visible ? 0 : 10)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const phases = isCorrection ? CORRECTION_PHASES : CREATE_PHASES;
  const phase = phases[phaseIndex % phases.length] ?? phases[0];
  const copy = resultCopy({ isCorrection, message, title, variant }) ?? phase;
  const directionCopy = directionVisual(direction, activeTheme);
  const categoryIcon = transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap;
  const categoryColor = transactionCategoryColor(category);
  const categoryBackground = transactionCategoryBackgroundColor(category);
  const statusColor =
    variant === 'danger'
      ? activeTheme.colors.danger
      : variant === 'success'
        ? activeTheme.colors.success
        : directionCopy.accentColor;

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
  }, [isCorrection, phases.length, variant, visible]);

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

  if (!mounted) {
    return null;
  }

  return (
    <Modal animationType="none" statusBarTranslucent transparent visible={mounted}>
      <Animated.View
        style={[styles.scrim, { backgroundColor: activeTheme.colors.scrim, opacity }]}
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
                styles.amountHalo,
                {
                  backgroundColor: `${statusColor}10`,
                  borderColor: `${statusColor}24`,
                  transform: [{ scale: pulse }],
                },
              ]}
            />
            <View
              style={[
                styles.directionNode,
                {
                  backgroundColor: directionCopy.softBackgroundColor,
                  borderColor: directionCopy.borderColor,
                },
              ]}
            >
              <Ionicons color={directionCopy.accentColor} name={directionCopy.icon} size={24} />
              <AppText
                numberOfLines={1}
                style={[styles.nodeLabel, { color: directionCopy.accentColor }]}
              >
                {directionCopy.label}
              </AppText>
            </View>
            <View
              style={[
                styles.amountNode,
                {
                  backgroundColor: activeTheme.colors.surface,
                  borderColor: `${statusColor}36`,
                },
              ]}
            >
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                numberOfLines={1}
                style={[styles.amountText, { color: statusColor }]}
              >
                {amountLabel}
              </AppText>
              <AppText
                numberOfLines={1}
                style={[styles.amountMeta, { color: activeTheme.colors.textMuted }]}
              >
                {personLabel ?? 'otra persona'}
              </AppText>
            </View>
            <View
              style={[
                styles.categoryNode,
                {
                  backgroundColor: categoryBackground,
                  borderColor: `${categoryColor}36`,
                },
              ]}
            >
              <Ionicons color={categoryColor} name={categoryIcon} size={22} />
              <AppText numberOfLines={1} style={[styles.nodeLabel, { color: categoryColor }]}>
                {transactionCategoryLabel(category)}
              </AppText>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  amountHalo: {
    borderRadius: 100,
    borderWidth: 1,
    height: 200,
    position: 'absolute',
    width: 200,
  },
  amountMeta: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 16,
    maxWidth: 134,
    textAlign: 'center',
  },
  amountNode: {
    alignItems: 'center',
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    gap: 3,
    height: 132,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    position: 'absolute',
    width: 168,
  },
  amountText: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
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
  categoryNode: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    bottom: 12,
    gap: 2,
    justifyContent: 'center',
    minHeight: 70,
    minWidth: 92,
    paddingHorizontal: theme.spacing.xs,
    position: 'absolute',
    right: 14,
  },
  copy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: '100%',
  },
  directionNode: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: 2,
    justifyContent: 'center',
    left: 14,
    minHeight: 70,
    minWidth: 92,
    paddingHorizontal: theme.spacing.xs,
    position: 'absolute',
    top: 12,
  },
  message: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  nodeLabel: {
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 16,
    maxWidth: 82,
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
  stage: {
    alignItems: 'center',
    height: 230,
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
