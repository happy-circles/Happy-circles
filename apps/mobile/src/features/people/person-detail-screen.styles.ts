import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const personDetailScreenStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screenContent: {
    alignSelf: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    gap: theme.spacing.md,
    maxWidth: 560,
    minHeight: 0,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  fixedTop: {
    backgroundColor: theme.colors.background,
    flexShrink: 0,
    gap: theme.spacing.md,
  },
  detailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  detailHeaderSide: {
    alignItems: 'flex-start',
    flexShrink: 0,
    width: 44,
  },
  detailHeaderBackButton: {
    width: 36,
  },
  detailHeaderTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 28,
    minWidth: 0,
    textAlign: 'center',
  },
  heroBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    position: 'relative',
  },
  avatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  contactFlatName: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  balanceSummary: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 2,
    maxWidth: '100%',
    textAlign: 'center',
  },
  balanceSummaryAmount: {
    fontSize: theme.typography.title2,
    lineHeight: 30,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  pendingHeroBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    right: 0,
    top: 0,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  pendingHeroBadgeText: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 13,
  },
  heroMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  heroMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  quickActionRowFlat: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    width: '100%',
  },
  quickActionPill: {
    flex: 1,
    maxWidth: 240,
  },
  panelArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.md,
    minHeight: 0,
    paddingTop: theme.spacing.sm,
    width: '100%',
  },
  panelPager: {
    backgroundColor: theme.colors.background,
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
    position: 'relative',
    width: '100%',
  },
  panelPage: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  panelPageScroll: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  panelScrollContent: {
    flexGrow: 1,
    gap: theme.spacing.sm,
  },
  tabBar: {
    alignItems: 'stretch',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  tabButtonPressed: {
    opacity: 0.88,
  },
  tabDivider: {
    backgroundColor: theme.colors.hairline,
    marginBottom: theme.spacing.sm,
    width: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  pendingActionStack: {
    gap: theme.spacing.xs,
    width: '100%',
  },
  pendingActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    width: '100%',
  },
  circlePanelAction: {
    borderRadius: theme.radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  circlePanelDanger: {
    borderWidth: 1,
  },
  circleDetailLink: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
  },
  circleDetailLinkPressed: {
    opacity: 0.68,
  },
  circleDetailLinkText: {
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  neutral: {
    color: theme.colors.textMuted,
  },
  danger: {
    color: theme.colors.danger,
  },
});
