import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const transactionsScreenStyles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  backButtonPressed: {
    opacity: 0.68,
  },
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
  filterStack: {
    gap: theme.spacing.xs,
  },
  categoryFilterChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryFilterText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 16,
  },
  filterRail: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  filterPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  filterPillSelected: {
    backgroundColor: theme.colors.primaryGhost,
    borderColor: theme.colors.primaryGhost,
  },
  filterPillPressed: {
    opacity: 0.76,
  },
  filterPillText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  filterPillTextSelected: {
    color: theme.colors.primary,
  },
  loadingState: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
    textAlign: 'center',
  },
  historyListFooter: {
    height: theme.spacing.md,
  },
  historyListSeparator: {
    height: theme.spacing.sm,
  },
  headerActionSpacer: {
    height: 36,
    width: 36,
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
