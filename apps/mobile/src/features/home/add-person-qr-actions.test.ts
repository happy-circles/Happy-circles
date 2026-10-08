import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'expo-router';

const nativeMock = vi.hoisted(() => ({
  alert: vi.fn(),
  getCameraPermission: vi.fn(),
  listener: null as ((state: string) => void) | null,
  openSettings: vi.fn(),
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => unknown) => callback(),
  useMemo: (callback: () => unknown) => callback(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    nativeMock.stateSetters.push(setter);
    return [initial, setter];
  },
}));
vi.mock('react-native', () => ({
  Alert: { alert: nativeMock.alert },
  AppState: {
    addEventListener: (_event: string, callback: (state: string) => void) => {
      nativeMock.listener = callback;
      return { remove: vi.fn() };
    },
  },
  Linking: { openSettings: nativeMock.openSettings },
  Share: { share: vi.fn() },
}));
vi.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: nativeMock.getCameraPermission } }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('@/features/home/contacts-sheet-helpers', () => ({ isFreshQrDelivery: () => false }));
vi.mock('@/features/invites/people-outreach-utils', () => ({
  buildFriendshipInviteLink: vi.fn(),
  buildFriendshipInviteShareMessage: vi.fn(),
  extractInviteToken: vi.fn(),
}));
vi.mock('@/lib/action-feedback', () => ({ showBlockedActionAlert: vi.fn() }));
vi.mock('@/lib/navigation', () => ({ pushRoute: vi.fn() }));
vi.mock('@/features/invites/invite-delivery-validation', () => ({
  assertFriendshipDeliveryCurrent: vi.fn(),
}));

import { useAddPersonQrActions } from './add-person-qr-actions';

beforeEach(() => {
  vi.clearAllMocks();
  nativeMock.stateSetters = [];
  nativeMock.listener = null;
  nativeMock.openSettings.mockResolvedValue(undefined);
  nativeMock.getCameraPermission.mockResolvedValue({ granted: true, canAskAgain: true });
});

function qrActions(canAskAgain = false) {
  const requestCameraPermission = vi.fn(async () => ({ granted: false, canAskAgain }));
  const setMessage = vi.fn();
  return {
    requestCameraPermission,
    setMessage,
    actions: useAddPersonQrActions({
      cameraPermission: { granted: false, canAskAgain },
      createExternalFriendshipInvite: { mutateAsync: vi.fn() },
      onClose: vi.fn(),
      requestCameraPermission,
      router: {} as Router,
      setBusyKey: vi.fn(),
      setMessage,
    }),
  };
}

function chooseOpenSettings() {
  const buttons = nativeMock.alert.mock.calls.at(-1)?.[2] as Array<{
    readonly text: string;
    readonly onPress?: () => void;
  }>;
  const settings = buttons.find((button) => button.text === 'Abrir ajustes');
  expect(settings).toBeDefined();
  settings?.onPress?.();
}

describe('QR camera Settings recovery', () => {
  it('offers Settings instead of re-requesting a permanently blocked camera', async () => {
    const { actions, requestCameraPermission } = qrActions();

    await actions.handleOpenScanner();

    expect(requestCameraPermission).not.toHaveBeenCalled();
    expect(nativeMock.alert).toHaveBeenCalledOnce();
    expect(nativeMock.openSettings).not.toHaveBeenCalled();
  });

  it('resumes the requested scanner after the user grants access in Settings', async () => {
    const { actions } = qrActions();
    await actions.handleOpenScanner();
    chooseOpenSettings();

    nativeMock.listener?.('active');
    await vi.waitFor(() => expect(nativeMock.stateSetters[0]).toHaveBeenCalledWith(true));

    expect(nativeMock.openSettings).toHaveBeenCalledOnce();
    expect(nativeMock.getCameraPermission).toHaveBeenCalledOnce();
    nativeMock.listener?.('active');
    expect(nativeMock.getCameraPermission).toHaveBeenCalledOnce();
  });

  it('does not open the scanner on an ordinary foreground event or declined Settings alert', async () => {
    const { actions } = qrActions();
    nativeMock.listener?.('active');
    await actions.handleOpenScanner();
    nativeMock.listener?.('active');

    expect(nativeMock.getCameraPermission).not.toHaveBeenCalled();
    expect(nativeMock.stateSetters[0]).not.toHaveBeenCalledWith(true);
  });

  it('cancels a pending Settings return when the add-person sheet closes', async () => {
    const { actions } = qrActions();
    await actions.handleOpenScanner();
    chooseOpenSettings();
    actions.resetQrStateOnClose();
    nativeMock.listener?.('active');

    expect(nativeMock.getCameraPermission).not.toHaveBeenCalled();
    expect(nativeMock.stateSetters[0]).not.toHaveBeenCalledWith(true);
  });

  it('ignores a delayed permission read after the add-person sheet closes', async () => {
    let finishPermission!: (permission: { granted: boolean }) => void;
    nativeMock.getCameraPermission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPermission = resolve;
        }),
    );
    const { actions } = qrActions();
    await actions.handleOpenScanner();
    chooseOpenSettings();
    nativeMock.listener?.('active');
    actions.resetQrStateOnClose();
    finishPermission({ granted: true });
    await Promise.resolve();

    expect(nativeMock.stateSetters[0]).not.toHaveBeenCalledWith(true);
  });

  it('keeps the alternative visible if Settings returns without camera access', async () => {
    nativeMock.getCameraPermission.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    const { actions, setMessage } = qrActions();
    await actions.handleOpenScanner();
    chooseOpenSettings();
    nativeMock.listener?.('active');
    await vi.waitFor(() =>
      expect(setMessage).toHaveBeenCalledWith(expect.stringContaining('mostrar tu QR')),
    );

    expect(nativeMock.stateSetters[0]).not.toHaveBeenCalledWith(true);
  });

  it('requests permission directly when the system still permits it', async () => {
    const { actions, requestCameraPermission } = qrActions(true);
    await actions.handleOpenScanner();

    expect(requestCameraPermission).toHaveBeenCalledOnce();
    expect(nativeMock.alert).not.toHaveBeenCalled();
  });
});
