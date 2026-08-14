import { View } from 'react-native';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowLogoCopy,
  IdentityFlowSecondaryAction,
} from '@/components/identity-flow';
import { OtpCodeInput } from '@/components/otp-code-input';
import { accountCreateAccountStyles as styles } from './account-create-account-screen.styles';
import { formatEmailOtpResendLabel } from './account-create-account-verification';

interface AccountCreateAccountVerificationFormProps {
  readonly onResendEmailCode: () => void;
  readonly pendingVerificationEmail: string;
  readonly resendBusy: boolean;
  readonly resendCooldownSeconds: number;
  readonly setVerificationCode: (value: string) => void;
  readonly verificationBusy: boolean;
  readonly verificationCode: string;
  readonly verificationCodeValid: boolean;
}

export function AccountCreateAccountVerificationForm({
  onResendEmailCode,
  pendingVerificationEmail,
  resendBusy,
  resendCooldownSeconds,
  setVerificationCode,
  verificationBusy,
  verificationCode,
  verificationCodeValid,
}: AccountCreateAccountVerificationFormProps) {
  const formDisabled = verificationBusy || resendBusy;
  const resendDisabled = formDisabled || resendCooldownSeconds > 0;

  return (
    <IdentityFlowForm>
      <IdentityFlowLogoCopy
        subtitle={`Enviamos el enlace y el código a ${pendingVerificationEmail}.`}
        title="Confirma tu correo"
      />

      <IdentityFlowField
        error={
          verificationCode.length > 0 && !verificationCodeValid ? 'Debe tener 8 dígitos.' : null
        }
        icon="keypad"
        label="Código"
        status={
          verificationCode.length === 0 ? 'idle' : verificationCodeValid ? 'success' : 'danger'
        }
      >
        <OtpCodeInput
          disabled={formDisabled}
          hasError={verificationCode.length > 0 && !verificationCodeValid}
          onChangeText={setVerificationCode}
          value={verificationCode}
        />
      </IdentityFlowField>

      <View style={styles.verificationActions}>
        <IdentityFlowSecondaryAction
          disabled={resendDisabled}
          icon="mail"
          label={formatEmailOtpResendLabel({ resendBusy, resendCooldownSeconds })}
          onPress={resendDisabled ? undefined : onResendEmailCode}
        />
      </View>
    </IdentityFlowForm>
  );
}
