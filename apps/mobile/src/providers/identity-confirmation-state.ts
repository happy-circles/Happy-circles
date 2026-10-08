export interface IdentityConfirmationInput {
  readonly actionLabel: string;
  readonly purpose: 'device' | 'sensitive';
  readonly force?: boolean;
}

export type IdentityConfirmationMethod = 'biometric' | 'google' | 'apple' | 'password';

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
  } | null = null;

  begin(userId: string | null, input: IdentityConfirmationInput) {
    if (!userId || this.pending) return null;
    const request: IdentityConfirmationRequest = { id: ++this.sequence, userId, input };
    const promise = new Promise<boolean>((resolve) => {
      this.pending = { request, resolve };
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
    pending.resolve(confirmed && request.userId === userId);
    return true;
  }

  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(false);
  }
}
