import type { StepUpAuthInput } from '../session/types';

export function normalizeStepUpAuthInput(
  input?: boolean | StepUpAuthInput,
): Required<Pick<StepUpAuthInput, 'force'>> & Pick<StepUpAuthInput, 'password' | 'method'> {
  if (typeof input === 'boolean') return { force: input };
  return { force: input?.force ?? false, method: input?.method, password: input?.password };
}
