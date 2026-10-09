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
  IDENTITY_MODAL_DISMISS_TIMEOUT_MS: 1000,
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
  readonly purpose: IdentityConfirmationInput['purpose'];
  readonly error: string | null;
  readonly busyMethod: IdentityConfirmationMethod | 'session' | null;
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

  it('reports unavailable authorization when the previous native modal never acknowledges', async () => {
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
    await expect(pending).rejects.toMatchObject({ code: 'identity_confirmation_unavailable' });
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
    ).rejects.toMatchObject({ code: 'identity_confirmation_busy' });
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
    await expect(pending).rejects.toMatchObject({ code: 'identity_confirmation_unavailable' });
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
    await expect(pending).rejects.toMatchObject({ code: 'auth_required' });
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
    await expect(pending).rejects.toMatchObject({ code: 'identity_confirmation_unavailable' });
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

  it('rejects missing sessions, inactive apps and concurrent confirmations with recoverable codes', async () => {
    harness.session = { ...harness.session!, userId: null };
    renderProvider();
    await expect(
      useIdentityConfirmation().confirmIdentity({ actionLabel: 'registrar', purpose: 'device' }),
    ).rejects.toMatchObject({ code: 'auth_required' });
    harness.session = { ...harness.session, userId: 'user-a' };
    renderProvider();
    appState('background');
    await expect(
      useIdentityConfirmation().confirmIdentity({ actionLabel: 'registrar', purpose: 'device' }),
    ).rejects.toMatchObject({ code: 'identity_confirmation_unavailable' });
    appState('active');
    const first = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    await expect(
      useIdentityConfirmation().confirmIdentity({ actionLabel: 'registrar', purpose: 'device' }),
    ).rejects.toMatchObject({ code: 'identity_confirmation_busy' });
    (await openDialog()).onClose();
    await expect(first).resolves.toBe(false);
  });

  it('explains recent account authentication and keeps the device-specific dialog ready for a method', async () => {
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'crear el movimiento',
      purpose: 'device',
    });
    await vi.waitFor(() => expect(renderProvider()?.error).toContain('método vinculado'));
    const dialog = renderProvider()!;
    expect(dialog.purpose).toBe('device');
    expect(dialog.busyMethod).toBeNull();
    expect(dialog.methods).toEqual(['google']);
    dialog.onSubmit('google');
    await expect(pending).resolves.toBe(true);
  });

  it.each(['sensitive', 'device'] as const)(
    'reports how to recover when no linked method is available for %s confirmation',
    async (purpose) => {
      harness.session = {
        ...harness.session!,
        linkedMethods: {
          ...harness.session!.linkedMethods,
          hasGoogle: false,
          hasApple: false,
          hasEmailPassword: false,
        },
      };
      renderProvider();
      const pending = useIdentityConfirmation().confirmIdentity({
        actionLabel: 'registrar',
        purpose,
        force: true,
      });
      await expect(pending).rejects.toMatchObject({
        code: 'auth_required',
      });
      await expect(pending).rejects.toThrow('Vuelve a iniciar sesión');
      expect(renderProvider()).toBeNull();
    },
  );

  it('allows a linked method to recover after the automatic session check times out', async () => {
    vi.useFakeTimers();
    const authorization = deferredResult();
    harness.session!.authorizeCurrentDeviceSession.mockReturnValue(authorization.promise);
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(renderProvider()?.busyMethod).toBe('session');
    await vi.advanceTimersByTimeAsync(25_001);
    expect(renderProvider()?.error).toContain('tardando demasiado');
    expect(renderProvider()?.busyMethod).toBeNull();
    renderProvider()!.onSubmit('google');
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toBe(true);
    authorization.resolve({ success: true, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(renderProvider()).toBeNull();
  });

  it.each(['server_validation_failed', 'device_untrusted'] as const)(
    'settles device authorization without account methods after automatic failure %s',
    async (error) => {
      harness.session = {
        ...harness.session!,
        linkedMethods: {
          ...harness.session!.linkedMethods,
          hasGoogle: false,
          hasApple: false,
          hasEmailPassword: false,
        },
      };
      harness.session.authorizeCurrentDeviceSession.mockResolvedValue({ success: false, error });
      renderProvider();
      const pending = useIdentityConfirmation().confirmIdentity({
        actionLabel: 'registrar',
        purpose: 'device',
      });
      await expect(pending).rejects.toMatchObject({ code: 'identity_confirmation_unavailable' });
      await expect(pending).rejects.toThrow('Intenta nuevamente');
      expect(renderProvider()).toBeNull();
    },
  );

  it('settles device authorization without account methods when the automatic check throws', async () => {
    harness.session = {
      ...harness.session!,
      linkedMethods: {
        ...harness.session!.linkedMethods,
        hasGoogle: false,
        hasApple: false,
        hasEmailPassword: false,
      },
    };
    harness.session.authorizeCurrentDeviceSession.mockRejectedValue(new Error('offline'));
    renderProvider();
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    await expect(pending).rejects.toMatchObject({ code: 'identity_confirmation_unavailable' });
    expect(renderProvider()).toBeNull();
  });

  it('settles device authorization without account methods after a bounded automatic-check timeout', async () => {
    vi.useFakeTimers();
    const authorization = deferredResult();
    harness.session = {
      ...harness.session!,
      linkedMethods: {
        ...harness.session!.linkedMethods,
        hasGoogle: false,
        hasApple: false,
        hasEmailPassword: false,
      },
    };
    harness.session.authorizeCurrentDeviceSession.mockReturnValue(authorization.promise);
    renderProvider();
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    const result = expect(pending).rejects.toMatchObject({
      code: 'identity_confirmation_unavailable',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(renderProvider()?.busyMethod).toBe('session');
    await vi.advanceTimersByTimeAsync(25_001);
    await result;
    await expect(pending).rejects.toThrow('tardando demasiado');
    expect(renderProvider()).toBeNull();
    authorization.resolve({ success: true, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(renderProvider()).toBeNull();
  });

  it.each([true, false])(
    'rechecks app activity after iOS dismissal and resumes only after returning: %s',
    async (returnsActive) => {
      vi.useFakeTimers();
      harness.platform = 'ios';
      let dismiss!: () => void;
      const closed = new Promise<void>((resolve) => {
        dismiss = resolve;
      });
      coordinationMock.begin.mockReturnValueOnce({
        ready: Promise.resolve(true),
        closed,
        release: vi.fn(() => dismiss()),
        closing: vi.fn(() => closed),
      });
      const pending = useIdentityConfirmation().confirmIdentity({
        actionLabel: 'registrar',
        purpose: 'sensitive',
        force: true,
      });
      const settled = vi.fn();
      void pending.then(settled, settled);
      await vi.advanceTimersByTimeAsync(0);
      const dialog = renderProvider()!;
      dialog.onSubmit('google');
      await vi.advanceTimersByTimeAsync(0);
      expect(renderProvider()).toBeNull();
      appState('inactive');
      dialog.onDismiss();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).not.toHaveBeenCalled();
      if (returnsActive) {
        appState('active');
        await expect(pending).resolves.toBe(true);
      } else {
        const result = expect(pending).rejects.toMatchObject({
          code: 'identity_confirmation_unavailable',
        });
        await vi.advanceTimersByTimeAsync(5_001);
        await result;
        await expect(pending).rejects.toThrow('Vuelve a la app');
      }
    },
  );

  it('waits for successful iOS dismissal before resuming and permits a forced device confirmation afterward', async () => {
    harness.platform = 'ios';
    let dismiss!: () => void;
    const closed = new Promise<void>((resolve) => {
      dismiss = resolve;
    });
    const release = vi.fn(() => dismiss());
    coordinationMock.begin.mockReturnValueOnce({
      ready: Promise.resolve(true),
      closed,
      release,
      closing: vi.fn(() => closed),
    });
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'sensitive',
      force: true,
    });
    const settled = vi.fn();
    void pending.then(settled);
    const dialog = await openDialog();
    dialog.onSubmit('google');
    await vi.waitFor(() => expect(renderProvider()).toBeNull());
    expect(settled).not.toHaveBeenCalled();
    dialog.onDismiss();
    await expect(pending).resolves.toBe(true);
    expect(release).toHaveBeenCalledOnce();
    const next = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
      force: true,
    });
    const nextDialog = await openDialog();
    expect(nextDialog.purpose).toBe('device');
    nextDialog.onClose();
    await expect(next).resolves.toBe(false);
  });

  it('rejects a lost successful dismissal after a bounded wait instead of hanging or reporting cancellation', async () => {
    vi.useFakeTimers();
    harness.platform = 'ios';
    const neverClosed = new Promise<void>(() => undefined);
    const release = vi.fn();
    coordinationMock.begin.mockReturnValueOnce({
      ready: Promise.resolve(true),
      closed: neverClosed,
      release,
      closing: vi.fn(() => neverClosed),
    });
    const pending = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'sensitive',
      force: true,
    });
    const result = expect(pending).rejects.toMatchObject({
      code: 'identity_confirmation_unavailable',
    });
    await vi.advanceTimersByTimeAsync(0);
    renderProvider()!.onSubmit('google');
    await vi.advanceTimersByTimeAsync(0);
    expect(renderProvider()).toBeNull();
    await vi.advanceTimersByTimeAsync(1251);
    await result;
    await expect(pending).rejects.toThrow('cerrar la autorización');
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps a canceled native authorization single-flight until it settles, then allows an explicit retry', async () => {
    const oldAuthorization = deferredResult();
    const newAuthorization = deferredResult();
    harness
      .session!.authorizeCurrentDeviceSession.mockReturnValueOnce(oldAuthorization.promise)
      .mockReturnValueOnce(newAuthorization.promise);
    const first = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    const oldDialog = await openDialog();
    oldDialog.onClose();
    await expect(first).resolves.toBe(false);
    await vi.waitFor(() => expect(renderProvider()).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(
      useIdentityConfirmation().confirmIdentity({ actionLabel: 'registrar', purpose: 'device' }),
    ).rejects.toMatchObject({ code: 'identity_confirmation_busy' });
    expect(harness.session!.authorizeCurrentDeviceSession).toHaveBeenCalledOnce();
    oldAuthorization.resolve({ success: true, error: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const next = useIdentityConfirmation().confirmIdentity({
      actionLabel: 'registrar',
      purpose: 'device',
    });
    await openDialog();
    // A stale callback from the previously closed dialog cannot cancel the new request.
    // The old asynchronous proof has settled without confirming the canceled intention.
    oldDialog.onClose();
    await Promise.resolve();
    await Promise.resolve();
    expect(renderProvider()?.busyMethod).toBe('session');
    renderProvider()!.onSubmit('google');
    expect(harness.session!.trustCurrentDevice).not.toHaveBeenCalled();
    newAuthorization.resolve({ success: false, error: 'recent_auth_required' });
    await vi.waitFor(() => expect(renderProvider()?.busyMethod).toBeNull());
    renderProvider()!.onClose();
    await expect(next).resolves.toBe(false);
  });
});
