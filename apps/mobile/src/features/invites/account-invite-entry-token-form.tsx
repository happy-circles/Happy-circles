import { View } from 'react-native';

import {
  IdentityFlowField,
  IdentityFlowForm,
  IdentityFlowTextInput,
} from '@/components/identity-flow';
import { useAppTheme } from '@/providers/theme-provider';
import { accountInviteEntryStyles as styles } from './account-invite-entry-screen.styles';

export function AccountInviteEntryTokenForm({
  onBlurToken,
  onChangeToken,
  status,
  tokenFieldError,
  tokenInput,
}: {
  readonly onBlurToken: () => void;
  readonly onChangeToken: (value: string) => void;
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

      </IdentityFlowForm>
    </View>
  );
}
