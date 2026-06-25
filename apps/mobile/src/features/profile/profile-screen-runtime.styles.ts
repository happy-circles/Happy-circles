import { StyleSheet } from 'react-native';

import { IDENTITY_FLOW_CONTENT_MAX_WIDTH } from '@/components/identity-flow';
import { theme } from '@/lib/theme';

export const styles = StyleSheet.create({
  centeredContent: {},
  contentWidth: {
    gap: theme.spacing.sm,
    maxWidth: IDENTITY_FLOW_CONTENT_MAX_WIDTH,
  },
  headerSignOutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  accountHeader: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    position: 'relative',
    width: '100%',
  },
  profileScoreRow: {
    alignItems: 'flex-start',
    left: theme.spacing.xs,
    position: 'absolute',
    top: theme.spacing.xs,
    width: '100%',
    zIndex: 2,
  },
  accountCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: 340,
    width: '100%',
  },
  accountNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  accountNameEditor: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    maxWidth: '100%',
    width: '100%',
  },
  accountNameInput: {
    flex: 1,
    fontWeight: '700',
    minWidth: 0,
    textAlign: 'center',
  },
  accountNameActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  accountNameIconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountValue: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  accountMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  sectionBlock: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
  focusPanel: {
    backgroundColor: theme.colors.primaryGhost,
    borderRadius: theme.radius.small,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  sectionList: {
    gap: theme.spacing.sm,
  },
  sectionBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 19,
  },
  accountDeletionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  accountDeletionBody: {
    flex: 1,
  },
  rowPressed: {
    opacity: 0.72,
  },
  separator: {
    backgroundColor: theme.colors.hairline,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  actionCluster: {
    gap: theme.spacing.sm,
    paddingLeft: 52,
  },
  stepUpModalRoot: {
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  stepUpModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  stepUpDialog: {
    borderRadius: theme.radius.medium,
    gap: theme.spacing.md,
    maxWidth: 420,
    padding: theme.spacing.lg,
    width: '100%',
    ...theme.shadow.floating,
  },
  stepUpDialogHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  stepUpDialogIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepUpDialogCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  stepUpDialogTitle: {
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 22,
  },
  stepUpDialogBody: {
    fontSize: theme.typography.footnote,
    lineHeight: 19,
  },
  stepUpDialogError: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 19,
  },
  stepUpDialogActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  stepUpDismissButton: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  stepUpDismissButtonText: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  inlineActionRow: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  input: {
    minHeight: 48,
  },
  inlineButton: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  inlineButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineButtonDanger: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.dangerSoft,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  inlineButtonDangerText: {
    color: theme.colors.danger,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.62,
  },
});
