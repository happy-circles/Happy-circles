import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';

export const settlementDetailScreenStyles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  summaryCard: {
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  summaryBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  circleGraphCard: {
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
  },
  circleGraphHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  circleGraphTitleBlock: {
    flex: 1,
    gap: 2,
  },
  circleGraphTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 24,
  },
  circleGraphSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  circleGraphInfoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    marginTop: -2,
    width: 32,
  },
  circleGraphInfoButtonActive: {
    backgroundColor: theme.colors.primaryGhost,
  },
  circleGraphInfoButtonPressed: {
    opacity: 0.72,
  },
  circleGraph: {
    alignSelf: 'center',
    marginTop: theme.spacing.md,
    position: 'relative',
  },
  focusGraph: {
    alignSelf: 'center',
    height: 228,
    marginTop: theme.spacing.md,
    position: 'relative',
    width: 282,
  },
  focusCurveLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  focusNodeAbsolute: {
    position: 'absolute',
  },
  focusNodeIncoming: {
    left: 0,
    top: 82,
  },
  focusNodeCurrentPosition: {
    left: 114,
    top: 0,
  },
  focusNodeOutgoing: {
    left: 228,
    top: 82,
  },
  focusNodeWrap: {
    alignItems: 'center',
    width: 56,
  },
  focusNode: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  focusNodeLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    marginTop: 3,
    maxWidth: 56,
    textAlign: 'center',
  },
  focusArrowLabel: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    position: 'absolute',
  },
  focusArrowLabelIncoming: {
    left: 64,
    top: 44,
  },
  focusArrowLabelOutgoing: {
    right: 54,
    top: 44,
  },
  focusExplanationPill: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: 2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    position: 'absolute',
    top: 164,
    width: 132,
  },
  focusExplanationIncoming: {
    left: 0,
  },
  focusExplanationOutgoing: {
    right: 0,
  },
  focusExplanationLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  focusExplanationAmount: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionSlot: {
    flexGrow: 1,
    minWidth: 140,
  },
});
