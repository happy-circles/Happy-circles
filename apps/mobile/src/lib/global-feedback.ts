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
  listeners.forEach((listener) => listener(payload));
}
