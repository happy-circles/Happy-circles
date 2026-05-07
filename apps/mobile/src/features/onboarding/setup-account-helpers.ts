export type SecurityTone = 'danger' | 'muted' | 'success';

export type SetupProfileErrors = {
  readonly fullName?: string;
  readonly phoneNationalNumber?: string;
  readonly photo?: string;
};

export {
  resolveTrustedDeviceAuthMethods,
  resolveTrustActionLabel,
  resolveTrustMethodLabel,
  type TrustedDeviceAuthAvailability,
} from '@/lib/trusted-device-auth';

export function resolveSetupAccountRouteParams(input: {
  readonly editPhone?: string | string[];
  readonly returnTo?: string | string[];
  readonly step?: string | string[];
}): {
  readonly editPhoneMode: boolean;
  readonly requestedStep?: string;
  readonly returnTo?: string;
} {
  return {
    editPhoneMode:
      (Array.isArray(input.editPhone) ? input.editPhone[0] : input.editPhone) === 'true',
    requestedStep: Array.isArray(input.step) ? input.step[0] : input.step,
    returnTo: Array.isArray(input.returnTo) ? input.returnTo[0] : input.returnTo,
  };
}

export function validateSetupProfile(input: {
  readonly fullNameIsUsable: boolean;
  readonly needsPhoneInput: boolean;
  readonly phoneNationalNumber: string;
}): {
  readonly errors: SetupProfileErrors;
  readonly firstInvalidField: 'fullName' | 'phoneNationalNumber' | null;
} {
  const errors: SetupProfileErrors = {
    fullName: input.fullNameIsUsable ? undefined : 'Escribe tu nombre, no el correo.',
    phoneNationalNumber:
      !input.needsPhoneInput || input.phoneNationalNumber.trim().length >= 7
        ? undefined
        : 'Ingresa un celular valido.',
    photo: undefined,
  };

  return {
    errors,
    firstInvalidField: errors.fullName
      ? 'fullName'
      : errors.phoneNationalNumber
        ? 'phoneNationalNumber'
        : null,
  };
}
