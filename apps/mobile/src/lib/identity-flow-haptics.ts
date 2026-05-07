import {
  triggerAppActionHaptic,
  triggerAppErrorHaptic,
  triggerAppSelectionHaptic,
  triggerAppSuccessHaptic,
  triggerAppWarningHaptic,
} from './app-haptics';

export function triggerIdentitySelectionHaptic() {
  triggerAppSelectionHaptic();
}

export function triggerIdentityImpactHaptic() {
  triggerAppActionHaptic();
}

export function triggerIdentityWarningHaptic() {
  triggerAppWarningHaptic();
}

export function triggerIdentitySuccessHaptic() {
  triggerAppSuccessHaptic();
}

export function triggerIdentityErrorHaptic() {
  triggerAppErrorHaptic();
}
