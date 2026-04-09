export interface CountryOption {
  readonly iso2: string;
  readonly label: string;
  readonly callingCode: string;
}

export const COUNTRY_OPTIONS: readonly CountryOption[] = [
  { iso2: 'CO', label: 'Colombia', callingCode: '+57' },
  { iso2: 'MX', label: 'Mexico', callingCode: '+52' },
  { iso2: 'AR', label: 'Argentina', callingCode: '+54' },
  { iso2: 'PE', label: 'Peru', callingCode: '+51' },
  { iso2: 'CL', label: 'Chile', callingCode: '+56' },
  { iso2: 'US', label: 'Estados Unidos', callingCode: '+1' },
  { iso2: 'ES', label: 'Espana', callingCode: '+34' },
] as const;

export const DEFAULT_COUNTRY = COUNTRY_OPTIONS[0];

export function normalizePhoneDigits(value: string): string {
  return value.replaceAll(/\D/g, '');
}

export function normalizeCallingCode(value: string): string {
  const digits = normalizePhoneDigits(value);
  return digits.length > 0 ? `+${digits}` : '';
}

export function buildPhoneE164(callingCode: string, nationalNumber: string): string {
  const normalizedCallingCode = normalizeCallingCode(callingCode);
  const normalizedNationalNumber = normalizePhoneDigits(nationalNumber);
  return `${normalizedCallingCode}${normalizedNationalNumber}`;
}

export function formatPhoneForWhatsApp(phoneE164: string): string {
  return normalizePhoneDigits(phoneE164);
}
