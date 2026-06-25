import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';
import { transactionsFilterStyles } from './transactions-filter-styles';

const transactionsBaseStyles = StyleSheet.create({
  containedContent: {
    alignSelf: 'center',
    gap: theme.spacing.lg,
    maxWidth: 560,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  containedListItem: {
    alignSelf: 'center',
    maxWidth: 560,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  list: {
    gap: theme.spacing.sm,
  },
  historyListFooter: {
    height: theme.spacing.md,
  },
  historyListSeparator: {
    height: theme.spacing.sm,
  },
  headerActionSpacer: {
    height: 44,
    width: 44,
  },
  transactionsControlsSection: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  transactionsContentWidth: {
    gap: 0,
  },
  transactionsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  transactionsHeaderTitle: {
    flex: 1,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: 'center',
  },
  transactionsScreenContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  transactionsScreenRoot: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  transactionsTopChrome: {
    width: '100%',
  },
  virtualHistoryHeader: {
    paddingTop: theme.spacing.xs,
  },
  virtualHistoryTitle: {
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 24,
  },
  virtualList: {
    flex: 1,
  },
});

export const transactionsScreenStyles = {
  ...transactionsBaseStyles,
  ...transactionsFilterStyles,
};
