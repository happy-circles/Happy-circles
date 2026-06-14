export type SecurityTone = 'danger' | 'muted' | 'success';

export const SETUP_ACCOUNT_PREVIEW_TOKEN = 'onboarding-dev';

export type SetupAccountPreviewCase = 'complete' | 'email' | 'fresh' | 'security';

export type SetupProfileErrors = {
  readonly fullName?: string;
  readonly phoneNationalNumber?: string;
  readonly photo?: string;
};

export type SetupAccountMode = 'full_setup' | 'security_only';

export interface SetupAccountPreviewParams {
  readonly case: SetupAccountPreviewCase;
  readonly enabled: boolean;
}

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

function readRouteParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function isSetupAccountPreviewCase(value: string | undefined): value is SetupAccountPreviewCase {
  return value === 'complete' || value === 'email' || value === 'fresh' || value === 'security';
}

export function resolveSetupAccountPreviewParams(
  input: {
    readonly case?: string | string[];
    readonly preview?: string | string[];
    readonly token?: string | string[];
  },
  isDev: boolean,
): SetupAccountPreviewParams {
  const requestedCase = readRouteParam(input.case);
  const preview = readRouteParam(input.preview);
  const token = readRouteParam(input.token);

  return {
    case: isSetupAccountPreviewCase(requestedCase) ? requestedCase : 'fresh',
    enabled: isDev && preview === 'true' && token === SETUP_ACCOUNT_PREVIEW_TOKEN,
  };
}

export function resolveSetupAccountMode(input: {
  readonly editPhoneMode: boolean;
  readonly requestedStep?: string;
  readonly requiredComplete: boolean;
}): SetupAccountMode {
  if (input.requestedStep === 'security' && input.requiredComplete && !input.editPhoneMode) {
    return 'security_only';
  }

  return 'full_setup';
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
        : 'Ingresa un celular válido.',
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
