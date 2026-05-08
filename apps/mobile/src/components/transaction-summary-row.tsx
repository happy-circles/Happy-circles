import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { StatusChip } from '@/components/status-chip';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import { AppText } from '@/components/app-text';

const META_SEPARATOR = ` ${String.fromCharCode(183)} `;

export type TransactionSummaryStatusTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'neutral'
  | 'danger'
  | 'cycle';

export interface TransactionSummaryRowProps {
  readonly amountColor?: string;
  readonly amountLabel?: string | null;
  readonly amountStruckThrough?: boolean;
  readonly category?: string | null;
  readonly chevron?: 'forward' | 'up' | null;
  readonly highlighted?: boolean;
  readonly meta?: string | null;
  readonly statusLabel?: string | null;
  readonly statusTone?: TransactionSummaryStatusTone;
  readonly surface?: boolean;
  readonly showCategoryIcon?: boolean;
  readonly title: string;
  readonly unread?: boolean;
}

export function TransactionSummaryRow({
  amountColor = theme.colors.text,
  amountLabel,
  amountStruckThrough = false,
  category,
  chevron = null,
  highlighted = false,
  meta,
  statusLabel,
  statusTone = 'neutral',
  surface = false,
  showCategoryIcon = true,
  title,
  unread = false,
}: TransactionSummaryRowProps) {
  const categoryIcon = transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap;

  return (
    <View
      style={[
        styles.row,
        surface ? styles.surfaceRow : null,
        surface && highlighted ? styles.surfaceRowHighlighted : null,
      ]}
    >
      {showCategoryIcon ? (
        <View
          style={[
            styles.categoryIcon,
            { backgroundColor: transactionCategoryBackgroundColor(category) },
          ]}
        >
          <Ionicons color={transactionCategoryColor(category)} name={categoryIcon} size={15} />
        </View>
      ) : null}

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <AppText numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
          {statusLabel ? (
            <StatusChip compact iconOnly label={statusLabel} tone={statusTone} />
          ) : null}
        </View>
        {meta ? (
          <AppText numberOfLines={1} style={styles.meta}>
            {meta.replace(/\s*\|\s*/g, META_SEPARATOR)}
          </AppText>
        ) : null}
      </View>

      <View style={styles.side}>
        <View style={styles.amountRow}>
          {amountLabel ? (
            <AppText
              numberOfLines={1}
              style={[
                styles.amount,
                { color: amountColor },
                amountStruckThrough ? styles.amountStruckThrough : null,
              ]}
            >
              {amountLabel}
            </AppText>
          ) : null}
          {chevron ? (
            <Ionicons
              color={theme.colors.textMuted}
              name={chevron === 'up' ? 'chevron-up' : 'chevron-forward'}
              size={16}
            />
          ) : null}
        </View>
      </View>
      {unread ? <View pointerEvents="none" style={styles.unreadDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 50,
    position: 'relative',
  },
  surfaceRow: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  surfaceRowHighlighted: {
    backgroundColor: '#fffaf0',
    borderColor: 'rgba(249, 115, 22, 0.14)',
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
    minWidth: 0,
  },
  unreadDot: {
    backgroundColor: '#2f80ed',
    borderRadius: theme.radius.pill,
    height: 6,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 6,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  side: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: 104,
    minWidth: 72,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
  amount: {
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 17,
    textAlign: 'right',
  },
  amountStruckThrough: {
    opacity: 0.68,
    textDecorationLine: 'line-through',
  },
});
