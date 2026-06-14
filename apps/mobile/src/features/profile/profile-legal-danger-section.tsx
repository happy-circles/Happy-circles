import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/lib/theme';
import { ProfileStatusRow } from './profile-status-row';
import { styles } from './profile-screen-runtime.styles';

const PRIVACY_POLICY_URL = 'https://app.happy-circles.com/privacy';
const TERMS_URL = 'https://app.happy-circles.com/terms';
const SUPPORT_URL = 'https://app.happy-circles.com/support';

interface ProfileLegalDangerSectionProps {
  readonly busyAction: string | null;
  readonly inlineDangerButtonTextThemeStyle: {
    readonly color: string;
  };
  readonly inlineDangerButtonThemeStyle: {
    readonly backgroundColor: string;
    readonly borderColor: string;
  };
  readonly onConfirmAccountDeletion: () => void;
  readonly onOpenExternalUrl: (url: string, failureMessage: string) => void;
}

export function ProfileLegalDangerSection({
  busyAction,
  inlineDangerButtonTextThemeStyle,
  inlineDangerButtonThemeStyle,
  onConfirmAccountDeletion,
  onOpenExternalUrl,
}: ProfileLegalDangerSectionProps) {
  return (
    <>
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Legal y soporte</AppText>
        </View>

        <View style={styles.sectionList}>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              onOpenExternalUrl(
                PRIVACY_POLICY_URL,
                'No pudimos abrir la política de privacidad.',
              )
            }
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="shield-checkmark"
              subtitle="Uso de datos, retención y derechos"
              title="Privacidad"
              tone="primary"
              trailing={
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              }
            />
          </Pressable>

          <View style={styles.separator} />

          <Pressable
            accessibilityRole="link"
            onPress={() =>
              onOpenExternalUrl(TERMS_URL, 'No pudimos abrir los términos de servicio.')
            }
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="document-text"
              subtitle="Reglas de uso y responsabilidades"
              title="Términos"
              tone="muted"
              trailing={
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              }
            />
          </Pressable>

          <View style={styles.separator} />

          <Pressable
            accessibilityRole="link"
            onPress={() => onOpenExternalUrl(SUPPORT_URL, 'No pudimos abrir soporte.')}
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="help-circle"
              subtitle="soporte@happy-circles.com"
              title="Soporte"
              tone="muted"
              trailing={
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              }
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Eliminar cuenta</AppText>
        </View>

        <View style={styles.accountDeletionRow}>
          <AppText style={[styles.sectionBody, styles.accountDeletionBody]}>
            Esta acción es irreversible.
          </AppText>

          <Pressable
            accessibilityRole="button"
            disabled={busyAction === 'request-account-deletion'}
            onPress={onConfirmAccountDeletion}
            style={({ pressed }) => [
              styles.inlineButtonDanger,
              inlineDangerButtonThemeStyle,
              pressed ? styles.rowPressed : null,
              busyAction === 'request-account-deletion' ? styles.disabledButton : null,
            ]}
          >
            <AppText style={[styles.inlineButtonDangerText, inlineDangerButtonTextThemeStyle]}>
              {busyAction === 'request-account-deletion' ? 'Eliminando...' : 'Eliminar cuenta'}
            </AppText>
          </Pressable>
        </View>
      </View>
    </>
  );
}
