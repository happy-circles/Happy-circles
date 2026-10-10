import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
  session: {} as Record<string, unknown>,
  params: {} as { mode?: string; token?: string },
  router: { dismissTo: vi.fn(), push: vi.fn(), setParams: vi.fn() },
  homeHandoff: vi.fn(),
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
vi.mock('react-native', () => ({
  Animated: {
    Value: class {
      stopAnimation() {}
      setValue() {}
      interpolate() {
        return 0;
      }
    },
    View: 'AnimatedView',
    timing: () => ({
      start: (done?: (result: { finished: boolean }) => void) => done?.({ finished: true }),
    }),
  },
  Keyboard: { dismiss: vi.fn() },
  LayoutAnimation: { configureNext: vi.fn() },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  UIManager: {},
  View: 'View',
}));
vi.mock('expo-router', () => ({ useRouter: () => harness.router }));
vi.mock('@/components/brand-verification-lockup', () => ({
  BRAND_VERIFICATION_EASING: undefined,
  BRAND_VERIFICATION_RESULT_MS: 100,
}));
vi.mock('@/components/identity-flow', () => ({
  IdentityFlowLogoCopy: 'LogoCopy',
  IdentityFlowPrimaryAction: 'PrimaryAction',
  IdentityFlowScreen: 'IdentityScreen',
  IdentityFlowSecondaryAction: 'SecondaryAction',
}));
vi.mock('@/components/message-banner', () => ({ MessageBanner: 'MessageBanner' }));
vi.mock('@/components/launch-intro-presence', () => ({ useLaunchIntroVisible: () => false }));
vi.mock('@/lib/avatar', () => ({ resolveAvatarUrl: () => null }));
vi.mock('@/lib/home-entry-handoff', () => ({
  beginHomeEntryHandoffAfterScrollReset: harness.homeHandoff,
}));
vi.mock('@/lib/setup-entry-handoff', () => ({ beginSetupEntryHandoff: harness.setupHandoff }));
vi.mock('@/lib/identity-flow-haptics', () => ({
  triggerIdentityErrorHaptic: vi.fn(),
  triggerIdentityImpactHaptic: vi.fn(),
  triggerIdentitySelectionHaptic: vi.fn(),
  triggerIdentitySuccessHaptic: vi.fn(),
  triggerIdentityWarningHaptic: vi.fn(),
}));
vi.mock('@/lib/invite-intent', () => ({ writePendingInviteIntent: vi.fn() }));
vi.mock('@/lib/live-data', () => ({
  useAccountInvitePreviewQuery: () => ({ data: undefined, isFetching: false, refetch: vi.fn() }),
}));
vi.mock('@/providers/session-provider', () => ({ useSession: () => harness.session }));
vi.mock('@/providers/theme-provider', () => ({
  useAppTheme: () => ({ colors: { muted: '#888' } }),
}));
vi.mock('./account-invite-entry-animations', () => ({
  emailAccordionCloseLayoutAnimation: {},
  emailAccordionOpenLayoutAnimation: {},
}));
vi.mock('./account-invite-entry-token-form', () => ({ AccountInviteEntryTokenForm: 'TokenForm' }));
vi.mock('./account-invite-entry-identity', () => ({ AuthEntryIdentity: 'Identity' }));
vi.mock('./account-invite-entry-auth-form', () => ({ AccountInviteEntryAuthForm: 'AuthForm' }));
vi.mock('./account-invite-entry-screen.styles', () => ({ accountInviteEntryStyles: {} }));
vi.mock('./account-invite-entry-pending-token', () => ({
  usePendingAccountInviteTokenPreparation: () => ({
    prepare: async () => ({ token: null, version: 1 }),
    reconcile: async () => ({ token: null, version: 1 }),
    replaceInput: vi.fn(),
  }),
}));

import { AccountSignInEntry } from './account-invite-entry-flow';
import { resolveAccountInviteEntryParams } from './account-invite-entry-helpers';
import {
  isAuthRouteTransitionHoldActive,
  clearAuthRouteTransitionHold,
} from '@/lib/auth-route-transition-hold';

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
  for (let pass = 0; pass < 4; pass += 1) {
    harness.cursor = 0;
    const params = resolveAccountInviteEntryParams({
      hasRememberedAccount: Boolean(harness.session.rememberedAccount),
      isDev: false,
      rawModeParam: harness.params.mode,
      rawTokenParam: harness.params.token,
    });
    element = AccountSignInEntry(params) as unknown as Element;
    for (const effect of harness.pendingEffects.splice(0)) effect();
  }
  return element;
}
async function finishSignIn() {
  await vi.advanceTimersByTimeAsync(90);
  render();
  await vi.advanceTimersByTimeAsync(100);
  render();
  await vi.advanceTimersByTimeAsync(380);
  return render();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('React', {
    createElement: (
      type: string,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({
      type,
      props: { ...props, children: children.length === 1 ? children[0] : children },
    }),
  });
  harness.cursor = 0;
  harness.slots = [];
  harness.effects.clear();
  harness.pendingEffects = [];
  harness.params = {};
  harness.router.setParams.mockImplementation((params: { mode?: string; token?: string }) => {
    harness.params = { ...harness.params, ...params };
  });
  harness.homeHandoff.mockResolvedValue(undefined);
  harness.setupHandoff.mockResolvedValue(undefined);
  harness.session = {
    status: 'signed_in_unlocked',
    accountAccessState: 'needs_invite',
    profileCompletionState: 'complete',
    setupState: { requiredComplete: true, pendingRequiredSteps: [], securityPending: false },
    rememberedAccount: {
      displayName: 'Persona de prueba',
      email: 'person@example.test',
      avatarPath: null,
    },
    unlock: vi.fn().mockResolvedValue({ success: true, error: null }),
    signInWithGoogle: vi.fn().mockResolvedValue('Sesión iniciada.'),
    refreshAccountState: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  clearAuthRouteTransitionHold();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sign-in completion on the invitation entry screen', () => {
  it.each(['needs_invite', 'needs_activation'])(
    'releases remembered unlock controls for %s accounts and stays on usable token entry',
    async (accountAccessState) => {
      harness.session.accountAccessState = accountAccessState;
      const screen = render();
      const savedAccount = screen.props.message as Element;
      (savedAccount.props.onPress as () => void)();
      const completed = await finishSignIn();

      expect(harness.session.unlock).toHaveBeenCalledOnce();
      expect(harness.router.dismissTo).not.toHaveBeenCalled();
      expect(harness.params.mode).toBe('token');
      const tokenForm = find(completed, 'TokenForm')!;
      expect(tokenForm).toBeDefined();
      expect(find(completed.props.actions, 'SecondaryAction')?.props.disabled).toBe(false);
      expect(isAuthRouteTransitionHoldActive()).toBe(false);
      (tokenForm.props.onChangeToken as (token: string) => void)('invite-token-123456');
      const withToken = render();
      expect(find(withToken, 'TokenForm')?.props.tokenInput).toBe('invite-token-123456');
      expect(find(withToken, 'PrimaryAction')?.props.disabled).toBe(false);
    },
  );

  it('releases the same invitation entry after a successful Google login', async () => {
    harness.session.rememberedAccount = null;
    harness.params.mode = 'sign-in';
    const form = find(render(), 'AuthForm')!;
    (form.props.onSocialPress as (provider: string) => void)('google');
    const completed = await finishSignIn();
    expect(harness.session.signInWithGoogle).toHaveBeenCalledOnce();
    expect(find(completed, 'TokenForm')).toBeDefined();
    expect(find(completed.props.actions, 'SecondaryAction')?.props.disabled).toBe(false);
    expect(harness.router.dismissTo).not.toHaveBeenCalled();
  });

  it('releases invitation entry after automatic Face ID on a restored locked session', async () => {
    harness.session.status = 'signed_in_locked';
    harness.session.unlock = vi.fn(async () => {
      harness.session.status = 'signed_in_unlocked';
      return { success: true, error: null };
    });
    render();
    const completed = await finishSignIn();
    expect(harness.session.unlock).toHaveBeenCalledOnce();
    expect(find(completed, 'TokenForm')).toBeDefined();
    expect(find(completed.props.actions, 'SecondaryAction')?.props.disabled).toBe(false);
    expect(harness.params.mode).toBe('token');
    expect(harness.router.dismissTo).not.toHaveBeenCalled();
  });

  it('preserves Home navigation and handoff for an active account', async () => {
    harness.session.accountAccessState = 'active';
    const savedAccount = render().props.message as Element;
    (savedAccount.props.onPress as () => void)();
    await finishSignIn();
    expect(harness.homeHandoff).toHaveBeenCalledOnce();
    expect(harness.router.dismissTo).toHaveBeenCalledWith('/home');
    expect(harness.params.mode).toBeUndefined();
  });
});
