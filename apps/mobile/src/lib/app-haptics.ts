import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export type AppHapticFeedback = 'none' | 'selection' | 'impact' | 'success' | 'warning' | 'error';

function triggerAndroidVibration(durationMs: number) {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    Vibration.vibrate(durationMs);
  } catch {
    // Some Android skins disable vibration access for foreground apps.
  }
}

export function triggerAppSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function triggerAppActionHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function triggerAppRefreshReadyHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
  triggerAndroidVibration(8);
}

export function triggerAppRefreshStartHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  triggerAndroidVibration(14);
}

export function triggerAppEmphasisHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

export function triggerAppSuccessHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function triggerAppWarningHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function triggerAppErrorHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}

export function triggerAppHaptic(feedback: AppHapticFeedback = 'none') {
  if (feedback === 'selection') {
    triggerAppSelectionHaptic();
    return;
  }

  if (feedback === 'impact') {
    triggerAppActionHaptic();
    return;
  }

  if (feedback === 'success') {
    triggerAppSuccessHaptic();
    return;
  }

  if (feedback === 'warning') {
    triggerAppWarningHaptic();
    return;
  }

  if (feedback === 'error') {
    triggerAppErrorHaptic();
  }
}
