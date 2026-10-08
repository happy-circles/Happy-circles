export const BIOMETRIC_SUPPORT_TIMEOUT_MS = 8_000;

export async function queryBiometricSupport<T>(input: {
  readonly hasHardware: () => Promise<boolean>;
  readonly isEnrolled: () => Promise<boolean>;
  readonly supportedTypes: () => Promise<readonly T[]>;
  readonly labelForTypes: (types: readonly T[]) => string;
  readonly timeoutMs?: number;
}): Promise<{ readonly available: boolean; readonly label: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('biometric_support_timeout')),
      input.timeoutMs ?? BIOMETRIC_SUPPORT_TIMEOUT_MS,
    );
  });
  try {
    const [hardware, enrolled, types] = await Promise.race([
      Promise.all([input.hasHardware(), input.isEnrolled(), input.supportedTypes()]),
      deadline,
    ]);
    return { available: hardware && enrolled, label: input.labelForTypes(types) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
