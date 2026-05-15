import { View } from 'react-native';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowPrimaryAction,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { useAppTheme } from '@/providers/theme-provider';
import { accountInviteEntryStyles as styles } from './account-invite-entry-screen.styles';

export function AccountInviteEntryTokenForm({
  disabled,
  loading,
  onBlurToken,
  onChangeToken,
  onContinue,
  status,
  tokenFieldError,
  tokenInput,
}: {
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onBlurToken: () => void;
  readonly onChangeToken: (value: string) => void;
  readonly onContinue: () => void;
  readonly status: 'danger' | 'idle' | 'success';
  readonly tokenFieldError: string | null;
  readonly tokenInput: string;
}) {
  const activeTheme = useAppTheme();

  return (
    <View style={styles.rememberedMain}>
      <IdentityFlowForm>
        <IdentityFlowField
          error={tokenFieldError}
          icon="key"
          label="Código de invitación"
          status={status}
        >
          <IdentityFlowTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={onBlurToken}
            onChangeText={onChangeToken}
            placeholder="Se llena al abrir tu enlace"
            placeholderTextColor={activeTheme.colors.muted}
            value={tokenInput}
          />
        </IdentityFlowField>

        <IdentityFlowPrimaryAction
          disabled={disabled}
          label={loading ? 'Validando...' : 'Continuar'}
          loading={loading}
          onPress={loading ? undefined : onContinue}
        />
      </IdentityFlowForm>
    </View>
  );
}
