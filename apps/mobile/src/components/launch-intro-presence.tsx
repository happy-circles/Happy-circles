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
import { StyleSheet, View } from 'react-native';

const LAUNCH_TARGET_MEASURE_FRAMES = 90;

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
  readonly stageSize: number;
  readonly updatedAt: number;
  readonly visualState?: LaunchIntroTargetVisualState;
  readonly visualKind: LaunchIntroTargetVisualKind;
  readonly width: number;
  readonly x: number;
  readonly y: number;
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
        Math.abs(previous.x - target.x) < 0.5 &&
        Math.abs(previous.y - target.y) < 0.5 &&
        Math.abs(previous.width - target.width) < 0.5 &&
        Math.abs(previous.height - target.height) < 0.5
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
  const resolvedVisualKind =
    visualKind ??
    (kind === 'brand' ? 'headerBrand' : kind === 'avatar' ? 'identityAvatar' : 'identityMark');

  const clearRegistration = useCallback(() => {
    unregisterRef.current?.();
    unregisterRef.current = null;
  }, []);

  const measureTarget = useCallback(() => {
    if (disabled) {
      clearRegistration();
      return;
    }

    requestAnimationFrame(() => {
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (disabled || width <= 0 || height <= 0) {
          return;
        }

        unregisterRef.current = registerTarget({
          avatarEditable,
          avatarFallbackBackgroundColor,
          avatarFallbackTextColor,
          avatarLabel,
          avatarSize,
          avatarUrl,
          centerFaceSize,
          height,
          id,
          kind,
          outerRotationDegrees,
          priority,
          stageSize: stageSize ?? Math.max(1, Math.min(width, height)),
          updatedAt: Date.now(),
          visualState,
          visualKind: resolvedVisualKind,
          width,
          x,
          y,
        });
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
    resolvedVisualKind,
    stageSize,
    visualState,
  ]);

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
