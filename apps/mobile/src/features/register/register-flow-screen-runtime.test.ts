import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
  platform: 'android',
  mutationPending: false,
  sendRequest: vi.fn<(input: unknown) => Promise<unknown>>(),
  refetch: vi.fn(),
  globalFeedback: vi.fn(),
  alert: vi.fn(),
  router: { dismissTo: vi.fn(), back: vi.fn(), canGoBack: () => true, push: vi.fn() },
  navigation: { dispatch: vi.fn() },
  preventRemove: {
    enabled: false,
    callback: (() => undefined) as (event: { data: { action: unknown } }) => void,
  },
}));

function sameDependencies(previous: readonly unknown[] | undefined, next: readonly unknown[]) {
  return Boolean(
    previous &&
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index])),
  );
}

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) {
      harness.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    }
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
  useCallback: (callback: unknown, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      | { callback: unknown; dependencies: readonly unknown[] }
      | undefined;
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      harness.slots[index] = { callback, dependencies };
      return callback;
    }
    return previous?.callback;
  },
  useEffect: (callback: () => (() => void) | undefined, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      harness.pendingEffects.push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: callback() });
      });
    }
  },
}));
vi.mock('react-native', () => ({
  Alert: { alert: harness.alert },
  Keyboard: { addListener: () => ({ remove: vi.fn() }) },
  Platform: {
    get OS() {
      return harness.platform;
    },
    select: (values: Record<string, unknown>) => values[harness.platform] ?? values.default,
  },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@react-navigation/native', () => ({
  usePreventRemove: (
    enabled: boolean,
    callback: (event: { data: { action: unknown } }) => void,
  ) => {
    harness.preventRemove = { enabled, callback };
  },
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ personId: 'person-a' }),
  useNavigation: () => harness.navigation,
  useRouter: () => harness.router,
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@/components/app-avatar', () => ({ AppAvatar: 'Avatar' }));
vi.mock('@/components/app-text', () => ({ AppText: 'Text' }));
vi.mock('@/components/app-text-input', () => ({ AppTextInput: 'Input' }));
vi.mock('@/components/branded-refresh-control', () => ({
  BrandedRefreshScrollView: 'RefreshScroll',
}));
vi.mock('@/components/choice-chip', () => ({ ChoiceChip: 'Choice' }));
vi.mock('@/components/direction-pill', () => ({ DirectionPill: 'Direction' }));
vi.mock('@/components/empty-state', () => ({ EmptyState: 'EmptyState' }));
vi.mock('@/components/happy-circles-motion', () => ({ HappyCirclesMotion: 'Motion' }));
vi.mock('@/components/message-banner', () => ({ MessageBanner: 'Banner' }));
vi.mock('@/components/pending-financial-request-card', () => ({
  PendingFinancialRequestCard: 'PendingCard',
}));
vi.mock('@/components/primary-action', () => ({ PrimaryAction: 'PrimaryAction' }));
vi.mock('@/components/transaction-category-picker', () => ({
  TransactionCategoryPicker: 'CategoryPicker',
}));
vi.mock('@/components/transaction-action-feedback-overlay', () => ({
  TransactionActionFeedbackOverlay: 'TransactionFeedback',
}));
vi.mock('@/features/home/add-person-contacts-sheet', () => ({
  AddPersonContactsSheet: 'ContactsSheet',
}));
vi.mock('@/lib/app-haptics', () => ({
  triggerAppErrorHaptic: vi.fn(),
  triggerAppSuccessHaptic: vi.fn(),
}));
vi.mock('@/lib/identity-flow-haptics', () => ({ triggerIdentityWarningHaptic: vi.fn() }));
vi.mock('@/lib/global-feedback', () => ({ showGlobalFeedback: harness.globalFeedback }));
vi.mock('@/lib/live-data', () => ({
  useAppSnapshot: () => ({
    data: {
      people: [{ userId: 'person-a', displayName: 'Martha' }],
      peopleById: {},
      currentUserProfile: { displayName: 'Pedro' },
    },
    isLoading: false,
    error: null,
    refetch: harness.refetch,
  }),
  useCreateRequestMutation: (options: {
    runRequest: (action: () => Promise<unknown>) => Promise<unknown>;
  }) => ({
    isPending: harness.mutationPending,
    mutateAsync: async (input: unknown) => {
      harness.mutationPending = true;
      try {
        return await options.runRequest(() => harness.sendRequest(input));
      } finally {
        harness.mutationPending = false;
      }
    },
  }),
  useAmendFinancialRequestMutation: () => ({ isPending: false }),
  useCorrectFinancialRequestMutation: () => ({ isPending: false }),
  isFinancialRequestConflict: () => false,
}));
vi.mock('@/lib/use-snapshot-refresh', () => ({ useSnapshotRefresh: () => ({}) }));
vi.mock('@/providers/session-provider', () => ({
  useSession: () => ({
    userId: 'actor-a',
    isEmailConfirmed: true,
    profileCompletionState: 'complete',
    isAuthorizedDeviceSession: true,
    isLocked: false,
    linkedMethods: { hasEmailPassword: true },
    profile: { display_name: 'Pedro', phone_e164: '+573001234567' },
  }),
}));
vi.mock('@/providers/theme-provider', async () => {
  const { theme } = await import('@/lib/theme');
  return { useAppTheme: () => theme };
});
vi.mock('./register-flow-screen-styles', () => ({ styles: {} }));
vi.mock('./register-quick-person-chip', () => ({ QuickPersonChip: 'QuickPerson' }));

import { RegisterFlowScreen } from './register-flow-screen-runtime';
import { RegisterFooter } from './register-footer';

interface Element {
  readonly type: unknown;
  readonly props: Record<string, unknown> & { children?: unknown };
}

function find(
  element: unknown,
  type: unknown,
  predicate: (node: Element) => boolean = () => true,
): Element {
  const matches: Element[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Element;
    if (node.type === type && predicate(node)) matches.push(node);
    visit(node.props?.children);
  }
  visit(element);
  expect(matches).toHaveLength(1);
  return matches[0];
}

function render() {
  let element!: Element;
  for (let pass = 0; pass < 3; pass += 1) {
    harness.cursor = 0;
    element = RegisterFlowScreen() as unknown as Element;
    for (const effect of harness.pendingEffects.splice(0)) effect();
  }
  return element;
}

function footerAction(element: Element) {
  const footer = find(element, RegisterFooter);
  return find(
    RegisterFooter(footer.props as Parameters<typeof RegisterFooter>[0]),
    'PrimaryAction',
  );
}

function fillDraft() {
  const element = render();
  const amount = find(element, 'Input', (node) => node.props.placeholder === '0');
  const description = find(
    element,
    'Input',
    (node) => node.props.placeholder === 'Ej. Pizza del viernes',
  );
  (amount.props.onChangeText as (value: string) => void)('50000');
  (description.props.onChangeText as (value: string) => void)('Almuerzo');
  return render();
}

function deferredResponse() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('React', {
    createElement: (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
  });
  harness.cursor = 0;
  harness.slots = [];
  harness.effects.clear();
  harness.pendingEffects = [];
  harness.platform = 'android';
  harness.mutationPending = false;
  harness.refetch.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('registration feedback and completion', () => {
  it('keeps Android progress in the footer and navigates once after confirmation', async () => {
    const response = deferredResponse();
    harness.sendRequest.mockReturnValue(response.promise);
    const submit = footerAction(fillDraft()).props.onPress as () => void;
    submit();
    submit();
    render();
    await vi.advanceTimersByTimeAsync(500);

    const pending = render();
    expect(find(pending, 'TransactionFeedback').props.visible).toBe(false);
    expect(footerAction(pending).props).toMatchObject({
      loading: true,
      disabled: true,
      onPress: undefined,
    });
    expect(harness.preventRemove.enabled).toBe(true);
    const action = { type: 'POP_TO', payload: { name: 'person/[userId]' } };
    harness.preventRemove.callback({ data: { action } });
    expect(harness.navigation.dispatch).not.toHaveBeenCalled();
    expect(harness.router.dismissTo).not.toHaveBeenCalled();
    expect(harness.sendRequest).toHaveBeenCalledExactlyOnceWith({
      forceConfirmation: undefined,
      responderUserId: 'person-a',
      debtorUserId: 'actor-a',
      creditorUserId: 'person-a',
      amountMinor: 5_000_000,
      category: 'other',
      description: 'Almuerzo',
    });

    response.resolve({ requestId: 'request-confirmed', status: 'pending' });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.router.dismissTo).toHaveBeenCalledExactlyOnceWith(
      '/person/person-a?panel=pending&focus=request-confirmed',
    );
    // A second tap can arrive after the ACK while navigation still owns this instance.
    submit();
    expect(harness.sendRequest).toHaveBeenCalledOnce();
    harness.preventRemove.callback({ data: { action } });
    expect(harness.navigation.dispatch).toHaveBeenCalledExactlyOnceWith(action);
    expect(footerAction(render()).props).toMatchObject({ loading: false, disabled: false });
    expect(harness.refetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(220);
    expect(harness.globalFeedback).toHaveBeenCalledExactlyOnceWith({
      title: 'Movimiento creado',
      message: 'Con Martha.',
      tone: 'success',
    });
  });

  it('keeps Android error feedback, preserves the draft, and allows a deliberate retry', async () => {
    const response = deferredResponse();
    harness.sendRequest.mockReturnValue(response.promise);
    (footerAction(fillDraft()).props.onPress as () => void)();
    render();
    await vi.advanceTimersByTimeAsync(500);
    response.reject(new Error('Sin conexión'));
    await vi.advanceTimersByTimeAsync(0);
    const rejected = render();
    expect(find(rejected, 'TransactionFeedback').props).toMatchObject({
      visible: true,
      variant: 'danger',
      title: 'No se pudo',
    });
    expect(find(rejected, 'Banner').props.message).toBe('Sin conexión');
    expect(footerAction(rejected).props).toMatchObject({ loading: true, disabled: true });
    expect(harness.router.dismissTo).not.toHaveBeenCalled();
    expect(harness.globalFeedback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2200);
    const editable = render();
    expect(find(editable, 'Input', (node) => node.props.placeholder === '0').props.value).toBe(
      '50.000',
    );
    expect(
      find(editable, 'Input', (node) => node.props.placeholder === 'Ej. Pizza del viernes').props
        .value,
    ).toBe('Almuerzo');
    expect(footerAction(editable).props).toMatchObject({ loading: false, disabled: false });
    const retry = deferredResponse();
    harness.sendRequest.mockReturnValue(retry.promise);
    (footerAction(editable).props.onPress as () => void)();
    expect(harness.sendRequest).toHaveBeenCalledTimes(2);
    retry.resolve({ requestId: 'request-retried', status: 'pending' });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.router.dismissTo).toHaveBeenCalledExactlyOnceWith(
      '/person/person-a?panel=pending&focus=request-retried',
    );
  });

  it.each(['ios', 'web'])('preserves the loading overlay on %s', async (platform) => {
    harness.platform = platform;
    const response = deferredResponse();
    harness.sendRequest.mockReturnValue(response.promise);
    (footerAction(fillDraft()).props.onPress as () => void)();
    render();
    await vi.advanceTimersByTimeAsync(500);
    const pending = render();
    expect(find(pending, 'TransactionFeedback').props).toMatchObject({
      visible: true,
      variant: 'loading',
    });
    expect(footerAction(pending).props).toMatchObject({ loading: true, disabled: true });
    response.resolve({ requestId: 'request-confirmed', status: 'pending' });
    await vi.advanceTimersByTimeAsync(0);
  });
});
