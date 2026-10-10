import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
  params: { token: 'invite-token-123456' },
  session: {
    status: 'signed_out',
    accountAccessState: 'needs_invite',
    appleSignInAvailable: true,
    registerSocialAccount: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    refreshAccountState: vi.fn(),
  },
  router: { dismissTo: vi.fn() },
  writeInvite: vi.fn(),
  setupHandoff: vi.fn(),
}));

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [
      harness.slots[index],
      (value: unknown) => {
        harness.slots[index] =
          typeof value === 'function'
            ? (value as (previous: unknown) => unknown)(harness.slots[index])
            : value;
      },
    ];
  },
  useRef: (current: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current };
    return harness.slots[index];
  },
  useMemo: (callback: () => unknown) => callback(),
  useEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (
      !previous ||
      dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))
    ) {
      harness.pendingEffects.push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: callback() });
      });
    }
  },
}));
vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => harness.params,
  useRouter: () => harness.router,
}));
vi.mock('@/components/app-header-back-button', () => ({ AppHeaderBackButton: 'HeaderBack' }));
vi.mock('@/components/identity-flow', () => ({
  IdentityFlowForm: 'IdentityForm',
  IdentityFlowIdentity: 'Identity',
  IdentityFlowLogoCopy: 'LogoCopy',
  IdentityFlowPrimaryAction: 'PrimaryAction',
  IdentityFlowScreen: 'IdentityScreen',
}));
vi.mock('@/components/message-banner', () => ({ MessageBanner: 'MessageBanner' }));
vi.mock('@/components/primary-action', () => ({ PrimaryAction: 'PrimaryAction' }));
vi.mock('@/components/session-loading-screen', () => ({ SessionLoadingScreen: 'LoadingScreen' }));
vi.mock('@/lib/identity-flow-haptics', () => ({
  triggerIdentityErrorHaptic: vi.fn(),
  triggerIdentityImpactHaptic: vi.fn(),
  triggerIdentitySelectionHaptic: vi.fn(),
  triggerIdentitySuccessHaptic: vi.fn(),
  triggerIdentityWarningHaptic: vi.fn(),
}));
vi.mock('@/lib/invite-intent', () => ({ writePendingInviteIntent: harness.writeInvite }));
vi.mock('@/lib/live-data', () => ({
  useAccountInvitePreviewQuery: () => ({
    data: { status: 'pending_activation', deliveryStatus: 'issued', inviterDisplayName: 'Persona' },
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/lib/setup-entry-handoff', () => ({ beginSetupEntryHandoff: harness.setupHandoff }));
vi.mock('@/lib/account-verification', () => ({
  clearPendingAccountVerificationIfMatches: vi.fn(),
  writePendingAccountVerification: vi.fn(),
}));
vi.mock('@/providers/session-provider', () => ({ useSession: () => harness.session }));
vi.mock('./account-create-account-screen.styles', () => ({ accountCreateAccountStyles: {} }));
vi.mock('./account-create-account-email-form', () => ({
  AccountCreateAccountEmailForm: 'EmailForm',
}));
vi.mock('./account-create-account-social-options', () => ({
  AccountCreateAccountSocialOptions: 'SocialOptions',
}));
vi.mock('./account-create-account-verification-form', () => ({
  AccountCreateAccountVerificationForm: 'VerificationForm',
}));
vi.mock('./use-account-create-account-verification-resume', () => ({
  useAccountCreateAccountVerificationResume: () => ({
    refreshVerificationSession: vi.fn(),
    resendCooldownSeconds: 0,
    verificationHydrated: true,
  }),
}));

import { AccountCreateAccountScreen } from './account-create-account-screen';

interface Element {
  readonly type: string;
  readonly props: Record<string, unknown> & { children?: unknown };
}
function find(element: unknown, type: string): Element | undefined {
  if (!element || typeof element !== 'object') return undefined;
  if (Array.isArray(element)) {
    for (const child of element) {
      const match = find(child, type);
      if (match) return match;
    }
    return undefined;
  }
  const node = element as Element;
  return node.type === type ? node : find(node.props?.children, type);
}
function render() {
  let element!: Element;
  for (let pass = 0; pass < 3; pass += 1) {
    harness.cursor = 0;
    element = AccountCreateAccountScreen() as unknown as Element;
    for (const effect of harness.pendingEffects.splice(0)) effect();
  }
  return element;
}
function deferredResult() {
  let resolve!: (result: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__DEV__', false);
  vi.stubGlobal('React', {
    createElement: (
      type: string,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
  });
  harness.cursor = 0;
  harness.slots = [];
  harness.effects.clear();
  harness.pendingEffects = [];
  harness.params = { token: 'invite-token-123456' };
  harness.session.status = 'signed_out';
  harness.session.accountAccessState = 'needs_invite';
  harness.session.registerSocialAccount.mockResolvedValue('Sesión iniciada.');
  harness.session.refreshAccountState.mockResolvedValue(undefined);
  harness.writeInvite.mockResolvedValue(undefined);
  harness.setupHandoff.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  vi.unstubAllGlobals();
});

describe('invited social registration screen', () => {
  it.each(['google', 'apple'] as const)(
    'registers with %s and the invitation instead of invoking login, then continues setup',
    async (provider) => {
      const result = deferredResult();
      harness.session.registerSocialAccount.mockImplementation(async () => {
        const message = await result.promise;
        harness.session.status = 'signed_in_unlocked';
        return message;
      });
      const options = find(render(), 'SocialOptions')!;
      (options.props.onSocialCreate as (provider: string) => void)(provider);
      await vi.waitFor(() =>
        expect(harness.session.registerSocialAccount).toHaveBeenCalledWith({
          provider,
          deliveryToken: 'invite-token-123456',
        }),
      );
      expect(find(render(), 'SocialOptions')?.props.authBusy).toBe(true);
      expect(harness.session.signInWithGoogle).not.toHaveBeenCalled();
      expect(harness.session.signInWithApple).not.toHaveBeenCalled();
      result.resolve('Sesión iniciada.');
      await vi.waitFor(() =>
        expect(harness.router.dismissTo).toHaveBeenCalledWith({
          pathname: '/setup-account',
          params: { step: 'profile' },
        }),
      );
      expect(harness.setupHandoff).toHaveBeenCalledOnce();
      expect(harness.writeInvite).toHaveBeenCalledWith({
        type: 'account_invite',
        token: 'invite-token-123456',
        source: 'account_invite_signup',
      });
      expect(find(render(), 'SocialOptions')?.props.authBusy).toBe(false);
    },
  );

  it.each(['google', 'apple'] as const)(
    'keeps the invitation and unlocks signup controls when %s registration is refused',
    async (provider) => {
      const result = deferredResult();
      harness.session.registerSocialAccount.mockReturnValue(result.promise);
      const options = find(render(), 'SocialOptions')!;
      (options.props.onSocialCreate as (provider: string) => void)(provider);
      await vi.waitFor(() =>
        expect(harness.session.registerSocialAccount).toHaveBeenCalledWith({
          provider,
          deliveryToken: 'invite-token-123456',
        }),
      );
      expect(find(render(), 'SocialOptions')?.props.authBusy).toBe(true);
      result.resolve('La invitación no está autorizada.');
      await vi.waitFor(() => expect(find(render(), 'SocialOptions')?.props.authBusy).toBe(false));
      const rejected = render();
      expect((rejected.props.message as Element).props.message).toBe(
        'La invitación no está autorizada.',
      );
      expect(rejected.props.contentTransitionKey).toBe('create-account:form');
      expect(harness.params.token).toBe('invite-token-123456');
      expect(harness.router.dismissTo).not.toHaveBeenCalled();
      expect(harness.setupHandoff).not.toHaveBeenCalled();
      expect(harness.session.signInWithGoogle).not.toHaveBeenCalled();
      expect(harness.session.signInWithApple).not.toHaveBeenCalled();
      const remainingOptions = find(rejected, 'SocialOptions')!;
      (remainingOptions.props.onToggleEmailPassword as () => void)();
      expect(find(render(), 'EmailForm')).toBeDefined();
    },
  );
});
