import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const PEOPLE_TILE_WIDTH = 68;
export const PEOPLE_TILE_CIRCLE_SIZE = 56;
export const PEOPLE_TILE_AVATAR_SIZE = 52;
export const PEOPLE_TILE_LABEL_LINE_HEIGHT = 15;
export const HOME_REGISTER_FAB_CLEARANCE = 132;

export const dashboardStyles = StyleSheet.create({
  homeContent: {
    gap: theme.spacing.xl,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  quickActionPressed: {
    opacity: 0.6,
  },
  peopleSectionAction: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
  },
  peopleSectionActionText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  peopleRailContent: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
  peopleTile: {
    alignItems: 'center',
    gap: 6,
    width: PEOPLE_TILE_WIDTH,
  },
  shortcutCircle: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: PEOPLE_TILE_CIRCLE_SIZE,
    justifyContent: 'center',
    position: 'relative',
    width: PEOPLE_TILE_CIRCLE_SIZE,
  },
  shortcutCircleDashed: {
    borderStyle: 'dashed',
  },
  requestBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.background,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -3,
    top: -3,
  },
  requestBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  personAvatarRing: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    height: PEOPLE_TILE_CIRCLE_SIZE,
    justifyContent: 'center',
    width: PEOPLE_TILE_CIRCLE_SIZE,
  },
  peopleTileLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: PEOPLE_TILE_LABEL_LINE_HEIGHT,
    maxWidth: PEOPLE_TILE_WIDTH,
    minHeight: PEOPLE_TILE_LABEL_LINE_HEIGHT,
    textAlign: 'center',
  },
  transactionList: {
    gap: theme.spacing.sm,
  },
  transactionFooter: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 58,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  transactionFooterIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  transactionFooterCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  transactionFooterTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  transactionFooterDetail: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  transactionFooterCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    maxWidth: 78,
  },
  transactionFooterCtaText: {
    color: theme.colors.textMuted,
    flexShrink: 1,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
  },
  sheetScrim: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  friendshipSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.sm,
    height: '82%',
    maxHeight: '88%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  sheetCloseButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sheetTabs: {
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  sheetTab: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  sheetTabActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  sheetTabText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  sheetTabTextActive: {
    color: theme.colors.text,
  },
  sheetTabBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 5,
  },
  sheetTabBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  requestList: {
    flexGrow: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  requestListEmpty: {
    justifyContent: 'center',
    paddingBottom: theme.spacing.xl,
  },
  requestPager: {
    flex: 1,
    minHeight: 0,
  },
  requestScroll: {
    flex: 1,
    minHeight: 0,
  },
  requestCard: {
    borderLeftWidth: 3,
  },
  requestCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  requestPersonRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  requestAvatarSlot: {
    flexShrink: 0,
    height: 48,
    width: 48,
  },
  requestPersonCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  requestPersonName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 20,
  },
  requestPersonMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  requestHeaderSide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  requestTypeIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.primaryGhost,
    borderRadius: theme.radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  requestActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  requestSingleActionRow: {
    justifyContent: 'flex-end',
  },
  requestIconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  requestIconButtonPrimary: {
    backgroundColor: theme.colors.primaryGhost,
  },
  requestIconButtonDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  actionDisabled: {
    opacity: 0.46,
  },
  sheetEmpty: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
  },
  sheetEmptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetEmptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
});
