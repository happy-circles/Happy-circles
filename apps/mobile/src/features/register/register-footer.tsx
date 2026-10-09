import { Ionicons } from '@expo/vector-icons';
import { View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/app-text';
import { PrimaryAction } from '@/components/primary-action';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
  type UserTransactionCategory,
} from '@/lib/transaction-categories';
import { useAppTheme } from '@/providers/theme-provider';
import type { RegisterAccessIssue } from './register-access';
import { styles } from './register-flow-screen-styles';

export function RegisterFooter({
  accessIssue,
  category,
  hasSelectedPerson,
  isCorrection,
  isSubmitting,
  onLayout,
  onSubmit,
  savePhase,
  summary,
}: {
  readonly accessIssue: RegisterAccessIssue | null;
  readonly category: UserTransactionCategory;
  readonly hasSelectedPerson: boolean;
  readonly isCorrection: boolean;
  readonly isSubmitting: boolean;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onSubmit: () => void;
  readonly savePhase: 'authorizing' | 'saving' | null;
  readonly summary: string;
}) {
  const activeTheme = useAppTheme();
  const label = isSubmitting
    ? savePhase === 'authorizing'
      ? 'Verificando acceso…'
      : isCorrection
        ? 'Enviando...'
        : 'Creando...'
    : (accessIssue?.actionLabel ?? (isCorrection ? 'Enviar correccion' : 'Registrar'));

  return (
    <View onLayout={onLayout} style={styles.footer}>
      {accessIssue ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.accessNotice, { backgroundColor: activeTheme.colors.warningSoft }]}
        >
          <AppText style={styles.accessNoticeTitle}>{accessIssue.title}</AppText>
          <AppText style={styles.accessNoticeMessage}>{accessIssue.message}</AppText>
        </View>
      ) : null}
      <View style={[styles.footerSummary, { backgroundColor: activeTheme.colors.primarySoft }]}>
        <AppText numberOfLines={1} style={styles.footerSummaryText}>
          {summary}
        </AppText>
        {hasSelectedPerson ? (
          <View style={styles.footerCategoryBadge}>
            <View
              style={[
                styles.footerCategoryIcon,
                {
                  backgroundColor: transactionCategoryBackgroundColor(category),
                },
              ]}
            >
              <Ionicons
                color={transactionCategoryColor(category)}
                name={transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap}
                size={14}
              />
            </View>
            <AppText numberOfLines={1} style={styles.footerCategoryText}>
              {transactionCategoryLabel(category)}
            </AppText>
          </View>
        ) : null}
      </View>
      <PrimaryAction
        compact
        disabled={isSubmitting}
        icon="checkmark"
        label={label}
        loading={isSubmitting}
        onPress={isSubmitting ? undefined : onSubmit}
        style={{ borderRadius: activeTheme.radius.pill, minHeight: 48 }}
      />
    </View>
  );
}
