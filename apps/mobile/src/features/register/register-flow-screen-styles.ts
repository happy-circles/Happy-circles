import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTapTarget: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  layout: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    width: '100%',
    ...theme.shadow.floating,
  },
  layoutTall: {
    height: '90%',
    maxHeight: '90%',
  },
  layoutCompact: {
    maxHeight: '90%',
  },
  fixedTop: {
    gap: theme.spacing.xs,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 5,
    width: 48,
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  heroTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  closeButtonPressed: {
    opacity: 0.92,
  },
  panelArea: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  panelAreaCompact: {
    flex: 0,
    flexShrink: 1,
  },
  sheetScrollWrap: {
    flex: 1,
    flexShrink: 1,
    position: 'relative',
  },
  sheetScrollWrapCompact: {
    flex: 0,
    flexShrink: 1,
  },
  sheetScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  sheetScrollContentCompact: {
    paddingBottom: theme.spacing.md,
  },
  loadingState: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  loadingMotion: {
    alignItems: 'center',
  },
  supportTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  emptyState: {
    gap: theme.spacing.sm,
  },
  formContent: {
    gap: theme.spacing.md,
  },
  amountCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  amountCardError: {
    borderColor: theme.colors.danger,
  },
  amountDisplayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  currencySymbol: {
    color: theme.colors.text,
    fontSize: 56,
    fontWeight: '300',
    lineHeight: 64,
    marginRight: theme.spacing.sm,
  },
  amountInput: {
    color: theme.colors.text,
    fontSize: 58,
    fontWeight: '800',
    lineHeight: 66,
    minHeight: 76,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'center',
    width: '72%',
  },
  amountSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
    justifyContent: 'flex-start',
  },
  amountSuggestionChip: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  amountSuggestionLabel: {
    fontSize: theme.typography.callout,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  fieldStack: {
    gap: theme.spacing.xs,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  inlineError: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  directionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  directionPill: {
    flex: 1,
  },
  personPrimaryCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 66,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  personPrimaryCardError: {
    borderColor: theme.colors.danger,
  },
  personPrimaryCardPressed: {
    opacity: 0.92,
  },
  personPrimaryCopy: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  personPrimaryName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  personPrimaryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 14,
  },
  quickPeopleCarouselContent: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  personSearchPanel: {
    gap: theme.spacing.xxs,
  },
  personSearchHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    paddingHorizontal: theme.spacing.xs,
  },
  personSearchResults: {
    gap: theme.spacing.xs,
  },
  quickPersonChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 48,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
  },
  quickPersonChipPressed: {
    opacity: 0.92,
  },
  quickPersonLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    maxWidth: 98,
  },
  footer: {
    gap: theme.spacing.xs,
    paddingTop: 6,
  },
  footerSummary: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.medium,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 46,
    paddingHorizontal: theme.spacing.sm,
  },
  footerSummaryText: {
    color: theme.colors.primary,
    flex: 1,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  footerCategoryBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  footerCategoryIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  footerCategoryText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  personOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 60,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  personOptionSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  personOptionPressed: {
    opacity: 0.92,
  },
  personOptionCopy: {
    flex: 1,
    gap: 3,
  },
  personOptionName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  personOptionMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 16,
  },
  personSearchEmptyState: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
});
