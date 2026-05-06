import type { LinkedMethods, SetupState } from './types';

export const BIOMETRICS_KEY = 'happy_circles.biometrics_enabled';
export const NOTIFICATIONS_KEY = 'happy_circles.notifications_enabled';
export const REMEMBERED_ACCOUNT_KEY = 'happy_circles.remembered_account';
export const LOCK_AFTER_MS = 5 * 60 * 1000;
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

export const EMPTY_LINKED_METHODS: LinkedMethods = {
  hasEmailPassword: false,
  hasGoogle: false,
  hasApple: false,
  hasPhone: false,
  providers: [],
};

export const EMPTY_SETUP_STATE: SetupState = {
  requiredComplete: false,
  pendingRequiredSteps: [],
  emailConfirmed: false,
  securityPending: false,
  biometricsEligible: false,
  contactsPermissionStatus: 'loading',
  notificationsPermissionStatus: 'loading',
};
