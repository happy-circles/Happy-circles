export function normalizeOtpCode(value: string, length = 8): string {
  return value.replace(/\D/g, '').slice(0, length);
}
