import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const transactionsFilterStyles = StyleSheet.create({
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
  filterPillPressed: {
    opacity: 0.76,
  },
  filterPillSelected: {
    backgroundColor: theme.colors.primaryGhost,
    borderColor: theme.colors.primaryGhost,
  },
  filterPillText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  filterPillTextSelected: {
    color: theme.colors.primary,
  },
  filterRail: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  filterStack: {
    gap: theme.spacing.xs,
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
});
