import { View } from 'react-native';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowLogoCopy,
  IdentityFlowSecondaryAction,
} from '@/components/identity-flow';
import { OtpCodeInput } from '@/components/otp-code-input';
import { accountCreateAccountStyles as styles } from './account-create-account-screen.styles';

interface AccountCreateAccountVerificationFormProps {
  readonly onContinueAfterEmailLink: () => void;
  readonly onEditEmail: () => void;
  readonly onResendEmailCode: () => void;
  readonly pendingVerificationEmail: string;
  readonly resendBusy: boolean;
  readonly setVerificationCode: (value: string) => void;
  readonly verificationBusy: boolean;
  readonly verificationCode: string;
  readonly verificationCodeValid: boolean;
}

export function AccountCreateAccountVerificationForm({
  onContinueAfterEmailLink,
  onEditEmail,
  onResendEmailCode,
  pendingVerificationEmail,
  resendBusy,
  setVerificationCode,
  verificationBusy,
  verificationCode,
  verificationCodeValid,
}: AccountCreateAccountVerificationFormProps) {
  const disabled = verificationBusy || resendBusy;

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
          disabled={disabled}
          hasError={verificationCode.length > 0 && !verificationCodeValid}
          onChangeText={setVerificationCode}
          value={verificationCode}
        />
      </IdentityFlowField>

      <View style={styles.verificationActions}>
        <IdentityFlowSecondaryAction
          disabled={disabled}
          icon="mail"
          label={resendBusy ? 'Enviando...' : 'Reenviar código'}
          onPress={disabled ? undefined : onResendEmailCode}
        />
        <IdentityFlowSecondaryAction
          disabled={disabled}
          icon="log-in-outline"
          label="Ya confirme el enlace"
          onPress={disabled ? undefined : onContinueAfterEmailLink}
        />
        <IdentityFlowSecondaryAction
          disabled={disabled}
          icon="create-outline"
          label="Editar correo"
          onPress={onEditEmail}
        />
      </View>
    </IdentityFlowForm>
  );
}
