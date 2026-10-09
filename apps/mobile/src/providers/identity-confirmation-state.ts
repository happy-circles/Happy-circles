export interface IdentityConfirmationInput {
  readonly actionLabel: string;
  readonly purpose: 'device' | 'sensitive';
  readonly force?: boolean;
}

export type IdentityConfirmationMethod = 'biometric' | 'google' | 'apple' | 'password';

export class IdentityConfirmationUnavailableError extends Error {
  readonly code:
    | 'identity_confirmation_unavailable'
    | 'identity_confirmation_busy'
    | 'auth_required';

  constructor(
    message = 'No pudimos abrir la autorización. Intenta nuevamente; tu borrador permanece en esta pantalla.',
    code: IdentityConfirmationUnavailableError['code'] = 'identity_confirmation_unavailable',
  ) {
    super(message);
    this.name = 'IdentityConfirmationUnavailableError';
    this.code = code;
  }
}

export function availableIdentityConfirmationMethods(input: {
  readonly purpose: IdentityConfirmationInput['purpose'];
  readonly isAuthorizedDeviceSession: boolean;
  readonly biometricAvailable: boolean;
  readonly hasGoogle: boolean;
  readonly hasApple: boolean;
  readonly appleSignInAvailable: boolean;
  readonly hasPassword: boolean;
}): readonly IdentityConfirmationMethod[] {
  const methods: IdentityConfirmationMethod[] = [];
  if (
    input.purpose === 'sensitive' &&
    input.isAuthorizedDeviceSession &&
    input.biometricAvailable
  ) {
    methods.push('biometric');
  }
  if (input.hasGoogle) methods.push('google');
  if (input.hasApple && input.appleSignInAvailable) methods.push('apple');
  if (input.hasPassword) methods.push('password');
  return methods;
}

export function canReuseIdentityConfirmation(
  input: IdentityConfirmationInput,
  state: {
    readonly isAuthorizedDeviceSession: boolean;
    readonly isLocked: boolean;
    readonly stepUpFreshUntil: number | null;
  },
  now = Date.now(),
): boolean {
  return Boolean(
    !input.force &&
    state.isAuthorizedDeviceSession &&
    !state.isLocked &&
    (input.purpose === 'device' || (state.stepUpFreshUntil && state.stepUpFreshUntil > now)),
  );
}

export interface IdentityConfirmationRequest {
  readonly id: number;
  readonly userId: string;
  readonly input: IdentityConfirmationInput;
}

/** One action owns the dialog; cancellation also settles its caller immediately. */
export class IdentityConfirmationRequests {
  private sequence = 0;
  private pending: {
    readonly request: IdentityConfirmationRequest;
    readonly resolve: (confirmed: boolean) => void;
    readonly reject: (error: Error) => void;
  } | null = null;

  begin(userId: string | null, input: IdentityConfirmationInput) {
    if (!userId || this.pending) return null;
    const request: IdentityConfirmationRequest = { id: ++this.sequence, userId, input };
    const promise = new Promise<boolean>((resolve, reject) => {
      this.pending = { request, resolve, reject };
    });
    return { request, promise };
  }

  isCurrent(request: IdentityConfirmationRequest, userId: string | null): boolean {
    return this.pending?.request.id === request.id && request.userId === userId;
  }

  finish(request: IdentityConfirmationRequest, userId: string | null, confirmed: boolean): boolean {
    if (this.pending?.request.id !== request.id) return false;
    const pending = this.pending;
    this.pending = null;
    if (request.userId !== userId) {
      pending.reject(
        new IdentityConfirmationUnavailableError(
          'La sesión cambió. Vuelve a intentar desde la cuenta actual.',
          'auth_required',
        ),
      );
    } else pending.resolve(confirmed);
    return true;
  }

  fail(error: Error, request?: IdentityConfirmationRequest): boolean {
    const pending = this.pending;
    if (!pending || (request && pending.request.id !== request.id)) return false;
    this.pending = null;
    pending.reject(error);
    return true;
  }

  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(false);
  }
}
