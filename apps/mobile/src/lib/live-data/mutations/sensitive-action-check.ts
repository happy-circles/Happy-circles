export interface ActionIdentityConfirmationInput {
  readonly actionLabel: string;
  readonly purpose: 'device' | 'sensitive';
  readonly force?: boolean;
}

export type ConfirmActionIdentity = (input: ActionIdentityConfirmationInput) => Promise<boolean>;

export interface SensitiveMutationSession {
  readonly userId: string | null;
  readonly isEmailConfirmed: boolean;
  readonly profileCompletionState: string;
  readonly isAuthorizedDeviceSession: boolean;
  readonly isLocked: boolean;
}

export class IdentityConfirmationCancelledError extends Error {
  constructor() {
    super('Acción cancelada.');
    this.name = 'IdentityConfirmationCancelledError';
  }
}

export function isIdentityConfirmationCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'IdentityConfirmationCancelledError';
}

export function isDeviceAuthorizationRequired(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'device_authorization_required'
  );
}

function assertAccountReady(
  session: SensitiveMutationSession,
): asserts session is SensitiveMutationSession & { readonly userId: string } {
  if (!session.userId) {
    throw new Error('Inicia sesión para continuar.');
  }
  if (!session.isEmailConfirmed) {
    throw new Error('Confirma tu correo antes de mover dinero o aprobar cambios sensibles.');
  }
  if (session.profileCompletionState !== 'complete') {
    throw new Error('Completa tu perfil antes de mover dinero o aprobar cambios sensibles.');
  }
}

export async function guardSensitiveMutationAction(
  session: SensitiveMutationSession,
  actionLabel: string,
  confirmIdentity: ConfirmActionIdentity,
): Promise<void> {
  assertAccountReady(session);
  if (session.isAuthorizedDeviceSession && !session.isLocked) {
    return;
  }

  const confirmed = await confirmIdentity({
    actionLabel,
    purpose: session.isAuthorizedDeviceSession ? 'sensitive' : 'device',
    force: session.isLocked,
  });
  if (!confirmed) {
    throw new IdentityConfirmationCancelledError();
  }
}

export async function runAuthorizedMutationAction<T>(input: {
  readonly actionLabel: string;
  readonly readSession: () => SensitiveMutationSession;
  readonly confirmIdentity: ConfirmActionIdentity;
  readonly action: (expectedUserId: string) => Promise<T>;
}): Promise<T> {
  const originalSession = input.readSession();
  assertAccountReady(originalSession);
  const expectedUserId = originalSession.userId;
  await guardSensitiveMutationAction(originalSession, input.actionLabel, input.confirmIdentity);

  function assertSameAccount() {
    if (input.readSession().userId !== expectedUserId) {
      throw new Error('La sesión cambió. Vuelve a intentar la acción.');
    }
  }

  assertSameAccount();
  try {
    return await input.action(expectedUserId);
  } catch (error) {
    if (!isDeviceAuthorizationRequired(error)) {
      throw error;
    }
    assertSameAccount();
    const confirmed = await input.confirmIdentity({
      actionLabel: input.actionLabel,
      purpose: 'device',
      force: true,
    });
    if (!confirmed) {
      throw new IdentityConfirmationCancelledError();
    }
    assertSameAccount();
    return input.action(expectedUserId);
  }
}
