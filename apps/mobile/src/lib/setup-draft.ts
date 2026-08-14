export function resolveHydratedDraftValue<T>(input: {
  readonly current: T;
  readonly incoming: T;
  readonly isDirty: boolean;
  readonly identityChanged: boolean;
}): T {
  return input.identityChanged || !input.isDirty ? input.incoming : input.current;
}
