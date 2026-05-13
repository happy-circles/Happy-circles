import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const transactionEventCardStyles = StyleSheet.create({
  avatarWrap: {
    height: 56,
    justifyContent: 'center',
    position: 'relative',
    width: 56,
  },
  avatarWrapCompact: {
    height: 42,
    width: 42,
  },
  categoryBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    bottom: -1,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 22,
  },
  categoryBadgeCompact: {
    borderWidth: 1.5,
    height: 16,
    width: 16,
  },
  context: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 17,
  },
  contextCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  metaCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  compactMetaStack: {
    gap: 2,
  },
  compactMetaRow: {
    alignItems: 'center',
    columnGap: 6,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    minWidth: 0,
    rowGap: 4,
  },
  compactMetaSegment: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    maxWidth: '100%',
    minWidth: 0,
  },
  compactMetaDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.pill,
    height: 3.5,
    width: 3.5,
  },
  compactMetaCategory: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
    maxWidth: '100%',
    minWidth: 0,
  },
  compactMetaText: {
    color: theme.colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
  },
  contextBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  contextBadgePositive: {
    backgroundColor: theme.colors.successSoft,
  },
  contextBadgeNegative: {
    backgroundColor: theme.colors.warningSoft,
  },
  contextBadgeCycle: {
    backgroundColor: theme.colors.cycleSoft,
  },
  contextBadgeText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  direction: {
    fontSize: theme.typography.caption,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
  directionCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  directionFloating: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 1,
  },
  directionFloatingCompact: {
    top: 0,
  },
  amountLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
    width: 104,
  },
  amountLineCompact: {
    gap: 3,
    width: 96,
  },
  amountStack: {
    alignItems: 'flex-end',
    minWidth: 0,
    position: 'relative',
  },
  amountStackFloating: {
    height: 32,
    justifyContent: 'center',
    minWidth: 72,
  },
  amount: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  amountCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  amountStruckThrough: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
  },
  cardPressable: {
    borderRadius: theme.radius.medium,
  },
});
