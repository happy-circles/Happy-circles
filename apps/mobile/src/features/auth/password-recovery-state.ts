import type { SessionStatus } from '@/providers/session/types';

export function resolvePasswordRecoveryScreenState(input: {
  readonly status: SessionStatus;
  readonly isPasswordRecoverySession: boolean;
}): 'loading' | 'ready' | 'unavailable' {
  if (input.status === 'loading') return 'loading';
  return input.isPasswordRecoverySession ? 'ready' : 'unavailable';
}
