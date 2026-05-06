type LaunchTargetRemeasureListener = () => void;

const listeners = new Set<LaunchTargetRemeasureListener>();

export function requestLaunchTargetRemeasure() {
  listeners.forEach((listener) => listener());
}

export function subscribeLaunchTargetRemeasure(listener: LaunchTargetRemeasureListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
