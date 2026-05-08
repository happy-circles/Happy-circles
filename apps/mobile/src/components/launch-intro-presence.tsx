import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';

import {
  clearIdentityFlowScrollTarget,
  upsertIdentityFlowScrollTarget,
} from '@/lib/identity-flow-scroll';
import { subscribeLaunchTargetRemeasure } from '@/lib/launch-target-remeasure';

const LAUNCH_TARGET_MEASURE_FRAMES = 120;
const LAUNCH_TARGET_STABLE_SAMPLES = 4;
const LAUNCH_TARGET_STABLE_THRESHOLD = 1.25;
const LAUNCH_TARGET_REMEASURE_FRAMES = 12;

export type LaunchIntroTargetKind = 'avatar' | 'brand' | 'mark';
export type LaunchIntroTargetVisualKind = 'headerBrand' | 'identityAvatar' | 'identityMark';
export type LaunchIntroCenterFaceSize = 'large' | 'small';
export type LaunchIntroTargetVisualState = 'error' | 'idle' | 'loading' | 'success';

export interface LaunchIntroTargetSnapshot {
  readonly avatarEditable?: boolean;
  readonly avatarFallbackBackgroundColor?: string;
  readonly avatarFallbackTextColor?: string;
  readonly avatarLabel?: string;
  readonly avatarSize?: number;
  readonly avatarUrl?: string | null;
  readonly centerFaceSize?: LaunchIntroCenterFaceSize;
  readonly height: number;
  readonly id: string;
  readonly kind: LaunchIntroTargetKind;
  readonly outerRotationDegrees?: number;
  readonly priority: number;
  readonly stableAt: number;
  readonly stageSize: number;
  readonly updatedAt: number;
  readonly visualState?: LaunchIntroTargetVisualState;
  readonly visualKind: LaunchIntroTargetVisualKind;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface LaunchTargetMeasurement {
  readonly height: number;
  readonly stageSize: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

function roundMeasurementValue(value: number) {
  return PixelRatio.roundToNearestPixel(value);
}

function isSameMeasurement(
  left: LaunchTargetMeasurement | null,
  right: LaunchTargetMeasurement | null,
) {
  if (!left || !right) {
    return false;
  }

  return (
    Math.abs(left.x - right.x) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.y - right.y) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.width - right.width) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.height - right.height) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
    Math.abs(left.stageSize - right.stageSize) <= LAUNCH_TARGET_STABLE_THRESHOLD
  );
}

interface LaunchIntroContextValue {
  readonly registerTarget: (target: LaunchIntroTargetSnapshot) => () => void;
  readonly target: LaunchIntroTargetSnapshot | null;
  readonly targets: readonly LaunchIntroTargetSnapshot[];
  readonly visible: boolean;
}

const LaunchIntroContext = createContext<LaunchIntroContextValue>({
  registerTarget: () => () => undefined,
  target: null,
  targets: [],
  visible: false,
});

export function LaunchIntroVisibilityProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: boolean;
}) {
  const [targets, setTargets] = useState<Record<string, LaunchIntroTargetSnapshot>>({});

  const registerTarget = useCallback((target: LaunchIntroTargetSnapshot) => {
    setTargets((current) => {
      const previous = current[target.id];
      if (
        previous &&
        previous.kind === target.kind &&
        previous.visualKind === target.visualKind &&
        previous.priority === target.priority &&
        previous.stageSize === target.stageSize &&
        previous.centerFaceSize === target.centerFaceSize &&
        previous.avatarUrl === target.avatarUrl &&
        previous.avatarEditable === target.avatarEditable &&
        previous.avatarLabel === target.avatarLabel &&
        previous.avatarSize === target.avatarSize &&
        previous.avatarFallbackBackgroundColor === target.avatarFallbackBackgroundColor &&
        previous.avatarFallbackTextColor === target.avatarFallbackTextColor &&
        previous.outerRotationDegrees === target.outerRotationDegrees &&
        previous.visualState === target.visualState &&
        previous.stableAt === target.stableAt &&
        previous.updatedAt === target.updatedAt &&
        Math.abs(previous.x - target.x) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
        Math.abs(previous.y - target.y) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
        Math.abs(previous.width - target.width) <= LAUNCH_TARGET_STABLE_THRESHOLD &&
        Math.abs(previous.height - target.height) <= LAUNCH_TARGET_STABLE_THRESHOLD
      ) {
        return current;
      }

      return {
        ...current,
        [target.id]: target,
      };
    });

    return () => {
      setTargets((current) => {
        if (!current[target.id]) {
          return current;
        }

        const next = { ...current };
        delete next[target.id];
        return next;
      });
    };
  }, []);

  const measuredTargets = useMemo(() => {
    const measuredTargets = Object.values(targets).filter(
      (entry) => entry.width > 0 && entry.height > 0,
    );

    measuredTargets.sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return right.updatedAt - left.updatedAt;
    });

    return measuredTargets;
  }, [targets]);

  const target = measuredTargets[0] ?? null;

  const contextValue = useMemo(
    () => ({
      registerTarget,
      target,
      targets: measuredTargets,
      visible: value,
    }),
    [measuredTargets, registerTarget, target, value],
  );

  return <LaunchIntroContext.Provider value={contextValue}>{children}</LaunchIntroContext.Provider>;
}

export function useLaunchIntroVisible() {
  return useContext(LaunchIntroContext).visible;
}

export function useLaunchIntroTarget() {
  return useContext(LaunchIntroContext).target;
}

export function useLaunchIntroTargets() {
  return useContext(LaunchIntroContext).targets;
}

export function LaunchIntroTargetView({
  avatarEditable,
  avatarFallbackBackgroundColor,
  avatarFallbackTextColor,
  avatarLabel,
  avatarSize,
  avatarUrl,
  centerFaceSize,
  children,
  disabled = false,
  kind = 'mark',
  outerRotationDegrees,
  priority = 10,
  stageSize,
  style,
  visualState,
  visualKind,
}: {
  readonly avatarEditable?: boolean;
  readonly avatarFallbackBackgroundColor?: string;
  readonly avatarFallbackTextColor?: string;
  readonly avatarLabel?: string;
  readonly avatarSize?: number;
  readonly avatarUrl?: string | null;
  readonly centerFaceSize?: LaunchIntroCenterFaceSize;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly kind?: LaunchIntroTargetKind;
  readonly outerRotationDegrees?: number;
  readonly priority?: number;
  readonly stageSize?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly visualState?: LaunchIntroTargetVisualState;
  readonly visualKind?: LaunchIntroTargetVisualKind;
}) {
  const id = useId();
  const { registerTarget, visible } = useContext(LaunchIntroContext);
  const targetRef = useRef<View | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);
  const latestMeasurementRef = useRef<LaunchTargetMeasurement | null>(null);
  const registeredMeasurementRef = useRef<LaunchTargetMeasurement | null>(null);
  const registeredStableAtRef = useRef<number | null>(null);
  const registeredUpdatedAtRef = useRef<number | null>(null);
  const stableSamplesRef = useRef(0);
  const remeasureFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const resolvedVisualKind =
    visualKind ??
    (kind === 'brand' ? 'headerBrand' : kind === 'avatar' ? 'identityAvatar' : 'identityMark');

  const clearRegistration = useCallback(() => {
    unregisterRef.current?.();
    unregisterRef.current = null;
    clearIdentityFlowScrollTarget(id);
    registeredMeasurementRef.current = null;
    registeredStableAtRef.current = null;
    registeredUpdatedAtRef.current = null;
  }, [id]);

  const resetMeasurementStability = useCallback(() => {
    latestMeasurementRef.current = null;
    stableSamplesRef.current = 0;
  }, []);

  const cancelPendingRemeasure = useCallback(() => {
    if (remeasureFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(remeasureFrameRef.current);
    remeasureFrameRef.current = null;
  }, []);

  const measureTarget = useCallback((options?: { readonly refreshStableTimestamp?: boolean }) => {
    if (disabled) {
      resetMeasurementStability();
      clearRegistration();
      return;
    }

    requestAnimationFrame(() => {
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (disabled || width <= 0 || height <= 0) {
          resetMeasurementStability();
          clearRegistration();
          return;
        }

        const nextMeasurement = {
          height: roundMeasurementValue(height),
          stageSize: roundMeasurementValue(stageSize ?? Math.max(1, Math.min(width, height))),
          width: roundMeasurementValue(width),
          x: roundMeasurementValue(x),
          y: roundMeasurementValue(y),
        };
        const previousMeasurement = latestMeasurementRef.current;
        stableSamplesRef.current = isSameMeasurement(previousMeasurement, nextMeasurement)
          ? stableSamplesRef.current + 1
          : 1;
        latestMeasurementRef.current = nextMeasurement;

        if (stableSamplesRef.current < LAUNCH_TARGET_STABLE_SAMPLES) {
          if (
            registeredMeasurementRef.current &&
            !isSameMeasurement(registeredMeasurementRef.current, nextMeasurement)
          ) {
            clearRegistration();
          }
          return;
        }

        const measuredAt = Date.now();
        const isRegisteredMeasurementStable = isSameMeasurement(
          registeredMeasurementRef.current,
          nextMeasurement,
        );
        const shouldRefreshStableTimestamp = Boolean(options?.refreshStableTimestamp);
        const stableAt =
          isRegisteredMeasurementStable && !shouldRefreshStableTimestamp
            ? (registeredStableAtRef.current ?? measuredAt)
            : measuredAt;
        const updatedAt =
          isRegisteredMeasurementStable && !shouldRefreshStableTimestamp
            ? (registeredUpdatedAtRef.current ?? measuredAt)
            : measuredAt;
        const targetSnapshot = {
          avatarEditable,
          avatarFallbackBackgroundColor,
          avatarFallbackTextColor,
          avatarLabel,
          avatarSize,
          avatarUrl,
          centerFaceSize,
          height: nextMeasurement.height,
          id,
          kind,
          outerRotationDegrees,
          priority,
          stableAt,
          stageSize: nextMeasurement.stageSize,
          updatedAt,
          visualState,
          visualKind: resolvedVisualKind,
          width: nextMeasurement.width,
          x: nextMeasurement.x,
          y: nextMeasurement.y,
        };
        registeredMeasurementRef.current = nextMeasurement;
        registeredStableAtRef.current = stableAt;
        registeredUpdatedAtRef.current = updatedAt;
        upsertIdentityFlowScrollTarget(targetSnapshot);
        unregisterRef.current = registerTarget(targetSnapshot);
      });
    });
  }, [
    avatarEditable,
    avatarFallbackBackgroundColor,
    avatarFallbackTextColor,
    avatarLabel,
    avatarSize,
    avatarUrl,
    centerFaceSize,
    clearRegistration,
    disabled,
    id,
    kind,
    outerRotationDegrees,
    priority,
    registerTarget,
    resetMeasurementStability,
    resolvedVisualKind,
    stageSize,
    visualState,
  ]);

  const measureForStability = useCallback(() => {
    cancelPendingRemeasure();
    resetMeasurementStability();

    let frameCount = 0;
    function measureNextFrame() {
      frameCount += 1;
      measureTarget({ refreshStableTimestamp: true });

      if (frameCount < LAUNCH_TARGET_REMEASURE_FRAMES) {
        remeasureFrameRef.current = requestAnimationFrame(measureNextFrame);
        return;
      }

      remeasureFrameRef.current = null;
    }

    measureNextFrame();
  }, [cancelPendingRemeasure, measureTarget, resetMeasurementStability]);

  useEffect(() => {
    const unsubscribe = subscribeLaunchTargetRemeasure(measureForStability);

    return () => {
      unsubscribe();
      cancelPendingRemeasure();
    };
  }, [cancelPendingRemeasure, measureForStability]);

  useEffect(() => {
    measureTarget();
    if (disabled) {
      return clearRegistration;
    }

    let frameCount = 0;
    let frameHandle: ReturnType<typeof requestAnimationFrame> | null = null;

    function measureUntilStable() {
      frameCount += 1;
      measureTarget();

      if (frameCount < LAUNCH_TARGET_MEASURE_FRAMES) {
        frameHandle = requestAnimationFrame(measureUntilStable);
      }
    }

    frameHandle = requestAnimationFrame(measureUntilStable);

    return () => {
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
      }
      clearRegistration();
    };
  }, [clearRegistration, disabled, measureTarget]);

  function handleLayout() {
    measureTarget();
  }

  return (
    <View
      collapsable={false}
      onLayout={handleLayout}
      ref={targetRef}
      style={[style, visible && !disabled ? styles.hiddenDuringLaunchIntro : null]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenDuringLaunchIntro: {
    opacity: 0,
  },
});
