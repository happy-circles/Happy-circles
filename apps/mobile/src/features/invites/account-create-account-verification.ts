export const EMAIL_OTP_RESEND_COOLDOWN_MS = 60_000;
export const ACCOUNT_VERIFICATION_SIGN_IN_HREF = '/join?mode=sign-in' as const;

export function emailOtpResendAvailableAt(nowMs: number = Date.now()) {
  return nowMs + EMAIL_OTP_RESEND_COOLDOWN_MS;
}

export function emailOtpResendSecondsRemaining(availableAtMs: number, nowMs: number = Date.now()) {
  if (!Number.isFinite(availableAtMs) || !Number.isFinite(nowMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((availableAtMs - nowMs) / 1_000));
}

export function formatEmailOtpResendLabel({
  resendBusy,
  resendCooldownSeconds,
}: {
  readonly resendBusy: boolean;
  readonly resendCooldownSeconds: number;
}) {
  if (resendBusy) {
    return 'Enviando...';
  }

  const normalizedSeconds = Math.max(0, Math.ceil(resendCooldownSeconds));

  if (normalizedSeconds === 0) {
    return 'Reenviar código';
  }

  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `Reenviar código en ${minutes}:${String(seconds).padStart(2, '0')}`;
}
