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

export type LaunchIntroTargetKind = 'avatar' | 'brand' | 'mark';

export interface LaunchIntroTargetSnapshot {
  readonly height: number;
  readonly id: string;
  readonly kind: LaunchIntroTargetKind;
  readonly priority: number;
  readonly updatedAt: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface LaunchIntroContextValue {
  readonly registerTarget: (target: LaunchIntroTargetSnapshot) => () => void;
  readonly target: LaunchIntroTargetSnapshot | null;
  readonly visible: boolean;
}

const LaunchIntroContext = createContext<LaunchIntroContextValue>({
  registerTarget: () => () => undefined,
  target: null,
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
        previous.priority === target.priority &&
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

  useEffect(() => {
    if (!value) {
      setTargets({});
    }
  }, [value]);

  const target = useMemo(() => {
    const measuredTargets = Object.values(targets).filter(
      (entry) => entry.width > 0 && entry.height > 0,
    );

    measuredTargets.sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return right.updatedAt - left.updatedAt;
    });

    return measuredTargets[0] ?? null;
  }, [targets]);

  const contextValue = useMemo(
    () => ({
      registerTarget,
      target,
      visible: value,
    }),
    [registerTarget, target, value],
  );

  return <LaunchIntroContext.Provider value={contextValue}>{children}</LaunchIntroContext.Provider>;
}

export function useLaunchIntroVisible() {
  return useContext(LaunchIntroContext).visible;
}

export function useLaunchIntroTarget() {
  return useContext(LaunchIntroContext).target;
}

export function LaunchIntroTargetView({
  children,
  disabled = false,
  kind = 'mark',
  priority = 10,
  style,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly kind?: LaunchIntroTargetKind;
  readonly priority?: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const id = useId();
  const { registerTarget, visible } = useContext(LaunchIntroContext);
  const targetRef = useRef<View | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  const clearRegistration = useCallback(() => {
    unregisterRef.current?.();
    unregisterRef.current = null;
  }, []);

  const measureTarget = useCallback(() => {
    if (!visible || disabled) {
      clearRegistration();
      return;
    }

    requestAnimationFrame(() => {
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (!visible || disabled || width <= 0 || height <= 0) {
          return;
        }

        clearRegistration();
        unregisterRef.current = registerTarget({
          height,
          id,
          kind,
          priority,
          updatedAt: Date.now(),
          width,
          x,
          y,
        });
      });
    });
  }, [clearRegistration, disabled, id, kind, priority, registerTarget, visible]);

  useEffect(() => {
    measureTarget();
    return clearRegistration;
  }, [clearRegistration, measureTarget]);

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
