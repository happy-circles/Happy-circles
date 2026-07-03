import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const styles = StyleSheet.create({
  centeredContent: {},
  contentWidth: {
    maxWidth: 460,
  },
  setupContent: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  disabledAction: {
    opacity: 0.58,
  },
  avatarStage: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  avatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEditBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    bottom: 2,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: 38,
  },
  identityCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: 340,
    width: '100%',
  },
  identityTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  identityHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  formBlock: {
    gap: theme.spacing.xl,
  },
  sectionBlock: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  sectionCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  securityList: {
    gap: theme.spacing.md,
  },
  securityAction: {
    gap: theme.spacing.sm,
    paddingLeft: 52,
  },
  inlineActionRow: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  inlineButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 9,
  },
  inlineButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  permissionTrailing: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  permissionStatus: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  helperTextDanger: {
    color: theme.colors.danger,
  },
  separator: {
    backgroundColor: theme.colors.hairline,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  stack: {
    gap: theme.spacing.sm,
  },
  phoneField: {
    position: 'relative',
    zIndex: 20,
  },
  phoneRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: theme.spacing.md,
  },
  callingCodeText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
  },
  countryMenu: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    left: 0,
    marginTop: theme.spacing.xs,
    overflow: 'hidden',
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 30,
    ...theme.shadow.floating,
  },
  countryOption: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  countryOptionLast: {
    borderBottomWidth: 0,
  },
  countryLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
  },
  countryCode: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
  },
});
