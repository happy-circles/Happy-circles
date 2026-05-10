import { triggerAppSuccessHaptic } from './app-haptics';

type GlobalFeedbackTone = 'success' | 'neutral';

export interface GlobalFeedbackPayload {
  readonly message?: string;
  readonly title: string;
  readonly tone?: GlobalFeedbackTone;
}

type GlobalFeedbackListener = (payload: GlobalFeedbackPayload) => void;

const listeners = new Set<GlobalFeedbackListener>();

export function subscribeGlobalFeedback(listener: GlobalFeedbackListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function showGlobalFeedback(payload: GlobalFeedbackPayload) {
  if (payload.tone === 'success' || !payload.tone) {
    triggerAppSuccessHaptic();
  }

  listeners.forEach((listener) => listener(payload));
}
