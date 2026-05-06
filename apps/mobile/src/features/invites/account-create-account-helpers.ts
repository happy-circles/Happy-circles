import type { MessageBannerTone } from '@/components/message-banner';
import { normalizePhoneDigits } from '@/lib/phone';

export type FieldStatus = 'idle' | 'valid' | 'invalid';
export type FieldName = 'email' | 'phone' | 'password';

export const ACCOUNT_CREATED_SETUP_MESSAGE = 'Cuenta creada. Ahora termina tu setup.';
export const ACCOUNT_CREATED_EMAIL_CONFIRMATION_MESSAGE = 'Cuenta creada. Revisa tu correo.';
export const ACCOUNT_CREATE_GENERIC_ERROR_MESSAGE = 'No se pudo crear la cuenta.';

export function countryFlag(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function joinReadableList(items: readonly string[]) {
  if (items.length <= 1) {
    return items[0] ?? '';
  }

  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function formatCreateAccountValidationMessage(input: {
  readonly emailValid: boolean;
  readonly passwordValid: boolean;
  readonly phoneValid: boolean;
}) {
  const invalidFields: string[] = [];

  if (!input.emailValid) {
    invalidFields.push('correo');
  }

  if (!input.phoneValid) {
    invalidFields.push('celular');
  }

  if (!input.passwordValid) {
    invalidFields.push('clave');
  }

  return `Revisa ${joinReadableList(invalidFields)}.`;
}

export function resolveCreateAccountMessageTone(message: string): MessageBannerTone {
  if (
    message === ACCOUNT_CREATED_SETUP_MESSAGE ||
    message === ACCOUNT_CREATED_EMAIL_CONFIRMATION_MESSAGE
  ) {
    return 'success';
  }

  if (message.startsWith('No se pudo')) {
    return 'danger';
  }

  if (message.startsWith('Vista temporal de QA')) {
    return 'neutral';
  }

  return 'warning';
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhoneNumber(value: string) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 6 && digits.length <= 20;
}

export function isValidPassword(value: string) {
  return value.length >= 8 && value.length <= 72;
}
