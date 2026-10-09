import { completeProfileSchema } from '@happy-circles/shared';

import { buildPhoneE164 } from '@/lib/phone';
import {
  isIdentityConfirmationCancelled,
  type ConfirmActionIdentity,
} from '@/lib/live-data/mutations/sensitive-action-check';
import { formatValidationMessage } from '@/providers/session/auth-errors';
import type { CompleteProfileInput } from '@/providers/session/types';

export async function prepareSetupProfileSave(input: {
  readonly draft: CompleteProfileInput;
  readonly currentPhone: string | null | undefined;
  readonly profileComplete: boolean;
  readonly preview: boolean;
  readonly confirmIdentity: ConfirmActionIdentity;
  readonly onValidationError: (message: string) => void;
}): Promise<CompleteProfileInput | null> {
  const validation = completeProfileSchema.safeParse(input.draft);
  if (!validation.success) {
    input.onValidationError(formatValidationMessage(validation.error));
    return null;
  }
  const nextPhone = buildPhoneE164(
    validation.data.phoneCountryCallingCode,
    validation.data.phoneNationalNumber,
  );
  if (
    input.profileComplete &&
    input.currentPhone &&
    input.currentPhone !== nextPhone &&
    !input.preview
  ) {
    try {
      if (
        !(await input.confirmIdentity({
          actionLabel: 'cambiar tu celular',
          purpose: 'sensitive',
          force: true,
        }))
      )
        return null;
    } catch (error) {
      if (!isIdentityConfirmationCancelled(error)) {
        input.onValidationError(
          error instanceof Error
            ? error.message
            : 'No pudimos confirmar tu identidad. Inténtalo de nuevo.',
        );
      }
      return null;
    }
  }
  return validation.data;
}
