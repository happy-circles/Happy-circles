import * as Haptics from 'expo-haptics';

export function triggerIdentitySelectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function triggerIdentityImpactHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function triggerIdentityWarningHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function triggerIdentitySuccessHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function triggerIdentityErrorHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}
