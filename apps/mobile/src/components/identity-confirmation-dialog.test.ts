import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native', () => ({
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
}));
vi.mock('@/components/app-text', () => ({ AppText: 'Text' }));
vi.mock('@/components/password-text-input', () => ({ PasswordTextInput: 'PasswordInput' }));
vi.mock('@/providers/theme-provider', () => ({ useAppTheme: () => ({ colors: {}, spacing: {} }) }));

import { IdentityConfirmationDialog } from './identity-confirmation-dialog';

interface Node {
  readonly type: string;
  readonly props: { readonly children: readonly unknown[]; readonly [key: string]: unknown };
}

beforeEach(() => {
  vi.stubGlobal('React', {
    createElement: (
      type: string,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({ type, props: { ...props, children } }),
  });
});
afterEach(() => vi.unstubAllGlobals());

function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}

function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textContent).join(' ');
  if (!value || typeof value !== 'object' || !('props' in value)) return '';
  return textContent((value as Node).props.children);
}

function dialog(purpose: 'device' | 'sensitive', busyMethod: 'session' | null = null) {
  const onClose = vi.fn();
  const element = IdentityConfirmationDialog({
    purpose,
    busyMethod,
    actionLabel: 'crear el movimiento',
    biometricLabel: 'Face ID',
    error: null,
    methods: ['google', 'password'],
    onClose,
    onDismiss: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
    password: 'existing password',
    visible: true,
  });
  return { element, onClose };
}

describe('identity confirmation dialog', () => {
  it('explains session authorization and keeps the movement draft while asking for an account method', () => {
    const { element } = dialog('device');
    const copy = textContent(element);
    expect(copy).toContain('Autoriza esta sesión');
    expect(copy).toContain('Necesitamos autorizar esta sesión para crear el movimiento');
    expect(copy).toContain('Tu borrador permanece en esta pantalla');
    expect(copy).toContain('Continuar con Google');
    expect(copy).toContain('Confirmar contraseña');
  });

  it('keeps the sensitive-action confirmation copy for an already authorized session', () => {
    const { element } = dialog('sensitive');
    expect(textContent(element)).toContain('Confirma para crear el movimiento');
    expect(textContent(element)).not.toContain('Autoriza esta sesión');
  });

  it('disables account methods during the automatic check while preserving explicit cancellation', () => {
    const { element, onClose } = dialog('device', 'session');
    expect(textContent(element)).toContain('Comprobando esta sesión');
    const buttons = nodes(element).filter((node) => node.type === 'Pressable');
    const methodButtons = buttons.filter((node) => node.props.accessibilityState);
    expect(methodButtons).toHaveLength(2);
    expect(methodButtons.every((node) => node.props.disabled === true)).toBe(true);
    const cancel = buttons.find((node) => textContent(node).includes('Ahora no'))!;
    expect(cancel.props.disabled).not.toBe(true);
    (cancel.props.onPress as () => void)();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
