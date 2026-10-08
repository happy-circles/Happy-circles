import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { BiometricAuthResult } from '@/lib/security';
import type { SessionContextValue } from '@/providers/session/types';
import type {
  IdentityConfirmationInput,
  IdentityConfirmationMethod,
} from './identity-confirmation-state';

type HarnessSession = Pick<
  SessionContextValue,
  | 'userId'
  | 'isAuthorizedDeviceSession'
  | 'isLocked'
  | 'isTrustedDevice'
  | 'stepUpFreshUntil'
  | 'biometricAvailable'
  | 'biometricLabel'
  | 'appleSignInAvailable'
  | 'linkedMethods'
> & {
  readonly authorizeCurrentDeviceSession: Mock<
    SessionContextValue['authorizeCurrentDeviceSession']
  >;
  readonly trustCurrentDevice: Mock<SessionContextValue['trustCurrentDevice']>;
  readonly stepUpAuth: Mock<SessionContextValue['stepUpAuth']>;
};

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  listeners: new Set<(state: string) => void>(),
  appState: 'active',
  platform: 'android',
  session: null as HarnessSession | null,
  context: null as { confirmIdentity(input: IdentityConfirmationInput): Promise<boolean> } | null,
}));

const coordinationMock = vi.hoisted(() => ({ begin: vi.fn() }));

function sameDependencies(previous: readonly unknown[] | undefined, next: readonly unknown[]) {
  return Boolean(
    previous &&
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index])),
  );
}

vi.mock('react', () => ({
  createContext: () => ({ Provider: 'IdentityContext' }),
  useContext: () => harness.context,
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots))
      harness.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [
      harness.slots[index],
      (value: unknown) => {
        harness.slots[index] = value;
      },
    ];
  },
  useCallback: (callback: unknown, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      | { dependencies: readonly unknown[]; value: unknown }
      | undefined;
    if (!sameDependencies(previous?.dependencies, dependencies))
      harness.slots[index] = { dependencies, value: callback };
    return (harness.slots[index] as { value: unknown }).value;
  },
  useMemo: (callback: () => unknown, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      | { dependencies: readonly unknown[]; value: unknown }
      | undefined;
    if (!sameDependencies(previous?.dependencies, dependencies))
      harness.slots[index] = { dependencies, value: callback() };
    return (harness.slots[index] as { value: unknown }).value;
  },
  useEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      previous?.cleanup?.();
      harness.effects.set(index, { dependencies, cleanup: callback() });
    }
  },
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return harness.platform;
    },
  },
  AppState: {
    get currentState() {
      return harness.appState;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      harness.listeners.add(listener);
      return { remove: () => harness.listeners.delete(listener) };
    },
  },
}));
vi.mock('@/lib/identity-modal-coordination', () => ({
  beginIdentityConfirmationPresentation: coordinationMock.begin,
}));
vi.mock('@/components/identity-confirmation-dialog', () => ({
  IdentityConfirmationDialog: 'IdentityDialog',
}));
vi.mock('./session-provider', () => ({ useSession: () => harness.session }));

import {
  IdentityConfirmationProvider,
  useIdentityConfirmation,
} from './identity-confirmation-provider';

interface DialogProps {
  readonly methods: readonly IdentityConfirmationMethod[];
  readonly onClose: () => void;
  readonly onSubmit: (method: IdentityConfirmationMethod) => void;
  readonly onDismiss: () => void;
  readonly visible: boolean;
}

function renderProvider(): DialogProps | null {
  harness.cursor = 0;
  const element = IdentityConfirmationProvider({ children: 'kept draft' });
  const props = element.props as {
    value: { confirmIdentity(input: IdentityConfirmationInput): Promise<boolean> };
    children: [string, { props: DialogProps } | null];
  };
  harness.context = props.value;
  expect(props.children[0]).toBe('kept draft');
  const dialog = props.children[1]?.props;
  return dialog?.visible ? dialog : null;
}

async function openDialog() {
  await vi.waitFor(() => expect(renderProvider()).not.toBeNull());
  return renderProvider()!;
}

function appState(state: string) {
  harness.appState = state;
  for (const listener of [...harness.listeners]) listener(state);
}

function deferredResult() {
  let resolve!: (result: BiometricAuthResult) => void;
  const promise = new Promise<BiometricAuthResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  coordinationMock.begin.mockImplementation(() => ({
    ready: Promise.resolve(true),
    closed: Promise.resolve(),
    closing: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }));
  vi.stubGlobal('React', {
    createElement: (
      _type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({
      props: { ...props, children: children.length === 1 ? children[0] : children },
    }),
  });
  harness.slots = [];
  harness.effects.clear();
  harness.listeners.clear();
  harness.appState = 'active';
  harness.platform = 'android';
  harness.context = null;
  harness.session = {
    userId: 'user-a',
    isAuthorizedDeviceSession: false,
    isLocked: false,
    isTrustedDevice: true,
    stepUpFreshUntil: null,
    biometricAvailable: false,
    biometricLabel: 'huella',
    appleSignInAvailable: false,
    linkedMethods: { hasGoogle: true, hasApple: true, hasEmailPassword: false },
    authorizeCurrentDeviceSession: vi
      .fn()
      .mockResolvedValue({ success: false, error: 'recent_auth_required' }),
    trustCurrentDevice: vi.fn().mockResolvedValue('Este teléfono ahora es confiable.'),
    stepUpAuth: vi.fn().mockResolvedValue({ success: true, error: null }),
  } as unknown as HarnessSession;
  renderProvider();
});

afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('identity confirmation provider lifecycle', () => {
  it('hides biometrics for a trusted device whose current session is unbound', async () => {
    harness.session = {
      ...harness.session!,
      isTrustedDevice: true,
      isAuthorizedDeviceSession: false,
      biometricAvailable: true,
      linkedMethods: { ...harness.session!.linkedMethods, hasEmailPassword: true },
    };
    renderProvider();
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    const dialog = await openDialog();
    expect(dialog.methods).toEqual(['google', 'password']);
    dialog.onClose();
    await expect(pending).resolves.toBe(false);
  });

  it('waits for the previous feedback modal to dismiss before presenting identity', async () => {
    let acknowledge!: (ready: boolean) => void;
    const presentation = {
      ready: new Promise<boolean>((resolve) => {
        acknowledge = resolve;
      }),
      closed: Promise.resolve(),
      closing: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    coordinationMock.begin.mockReturnValueOnce(presentation);
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    expect(renderProvider()).toBeNull();
    expect(harness.session?.stepUpAuth).not.toHaveBeenCalled();
    acknowledge(true);
    const dialog = await openDialog();
    dialog.onClose();
    await expect(pending).resolves.toBe(false);
  });

  it('cancels instead of stacking identity when the previous native modal never acknowledges', async () => {
    const release = vi.fn();
    coordinationMock.begin.mockReturnValueOnce({
      ready: Promise.resolve(false),
      closed: Promise.resolve(),
      closing: vi.fn(),
      release,
    });
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    await expect(pending).resolves.toBe(false);
    expect(renderProvider()).toBeNull();
    expect(release).toHaveBeenCalledOnce();
    expect(harness.session?.stepUpAuth).not.toHaveBeenCalled();
  });

  it('keeps feedback suspended until the identity modal acknowledges dismissal on iOS', async () => {
    harness.platform = 'ios';
    let dismissed!: () => void;
    const closed = new Promise<void>((resolve) => {
      dismissed = resolve;
    });
    const release = vi.fn(() => dismissed());
    const closing = vi.fn(() => closed);
    coordinationMock.begin.mockReturnValueOnce({
      ready: Promise.resolve(true),
      closed,
      closing,
      release,
    });
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    const dialog = await openDialog();
    dialog.onClose();
    await expect(pending).resolves.toBe(false);
    expect(closing).toHaveBeenCalledExactlyOnceWith(true);
    expect(release).not.toHaveBeenCalled();
    await expect(
      useIdentityConfirmation().confirmIdentity({
        actionLabel: 'aprobar',
        purpose: 'sensitive',
        force: true,
      }),
    ).resolves.toBe(false);
    dialog.onDismiss();
    await closed;
    expect(release).toHaveBeenCalledOnce();
  });

  it('checks server authorization when forced despite cached authorization', async () => {
    harness.session = { ...harness.session!, isAuthorizedDeviceSession: true };
    renderProvider();
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
      force: true,
    });
    await vi.waitFor(() =>
      expect(harness.session?.authorizeCurrentDeviceSession).toHaveBeenCalledOnce(),
    );
    (await openDialog()).onClose();
    await expect(pending).resolves.toBe(false);
  });

  it('settles immediately on background even while server authorization is pending', async () => {
    const authorization = deferredResult();
    vi.mocked(harness.session!.authorizeCurrentDeviceSession).mockReturnValue(
      authorization.promise,
    );
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    appState('background');
    await expect(pending).resolves.toBe(false);
    authorization.resolve({ success: true, error: null });
    await Promise.resolve();
    expect(renderProvider()).toBeNull();
  });

  it('allows only the requested provider handoff and waits for an active app before confirming', async () => {
    const authentication = deferredResult();
    vi.mocked(harness.session!.stepUpAuth).mockReturnValue(authentication.promise);
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    (await openDialog()).onSubmit('google');
    appState('background');
    authentication.resolve({ success: true, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(renderProvider()).not.toBeNull();
    appState('active');
    await expect(pending).resolves.toBe(true);
    expect(harness.session?.stepUpAuth).toHaveBeenCalledWith({ method: 'google', force: true });
  });

  it('cancels on account change and never resumes that account’s action from a late proof', async () => {
    const authentication = deferredResult();
    vi.mocked(harness.session!.stepUpAuth).mockReturnValue(authentication.promise);
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    (await openDialog()).onSubmit('google');
    harness.session = { ...harness.session!, userId: 'user-b' };
    renderProvider();
    await expect(pending).resolves.toBe(false);
    authentication.resolve({ success: true, error: null });
    await Promise.resolve();
    expect(renderProvider()).toBeNull();
  });

  it('cancels on unmount and ignores authentication that resolves afterward', async () => {
    const authentication = deferredResult();
    vi.mocked(harness.session!.stepUpAuth).mockReturnValue(authentication.promise);
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    (await openDialog()).onSubmit('google');
    for (const effect of harness.effects.values()) effect.cleanup?.();
    await expect(pending).resolves.toBe(false);
    authentication.resolve({ success: true, error: null });
    await Promise.resolve();
  });

  it('blocks duplicate submissions and lets close settle without waiting for native auth', async () => {
    const authentication = deferredResult();
    vi.mocked(harness.session!.stepUpAuth).mockReturnValue(authentication.promise);
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'aprobar',
      purpose: 'sensitive',
      force: true,
    });
    const dialog = await openDialog();
    expect(dialog.methods).toEqual(['google']);
    dialog.onSubmit('google');
    dialog.onSubmit('google');
    expect(harness.session?.stepUpAuth).toHaveBeenCalledOnce();
    dialog.onClose();
    await expect(pending).resolves.toBe(false);
    authentication.resolve({ success: true, error: null });
    await Promise.resolve();
  });
});
