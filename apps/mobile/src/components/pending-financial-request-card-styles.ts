import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const pendingFinancialRequestCardStyles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionSlot: {
    flex: 1,
  },
  responseActionRail: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  responseAction: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
  },
  responseActionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  responseActionDisabled: {
    opacity: 0.58,
  },
  responseActionText: {
    color: theme.colors.primary,
    flexShrink: 1,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 16,
  },
  amendmentPanel: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  amountPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  historyPanel: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  historyToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
    minHeight: 40,
  },
  historyTogglePressed: {
    opacity: 0.82,
  },
  historyToggleCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  historyToggleText: {
    flex: 1,
    gap: 2,
  },
  historyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  historySummary: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  historyToggleAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  historyToggleActionText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  historySteps: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 0,
    paddingTop: theme.spacing.xs,
  },
  historyStepRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  historyRail: {
    alignItems: 'center',
    width: 14,
  },
  historyMarker: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.pill,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  historyMarkerCurrent: {
    backgroundColor: theme.colors.primary,
  },
  historyLine: {
    backgroundColor: theme.colors.hairline,
    flex: 1,
    marginVertical: 3,
    width: StyleSheet.hairlineWidth,
  },
  historyStepBody: {
    flex: 1,
    gap: 3,
    paddingBottom: theme.spacing.xs,
  },
  historyStepTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  historyStepTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  historyAmount: {
    color: theme.colors.text,
    flexShrink: 0,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  historyAmountPositive: {
    color: theme.colors.success,
  },
  historyAmountNegative: {
    color: theme.colors.warning,
  },
  historyAmountDanger: {
    color: theme.colors.danger,
  },
  historyDescription: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  historyMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
});
