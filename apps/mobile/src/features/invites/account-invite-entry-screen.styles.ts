import { StyleSheet } from 'react-native';

import { IDENTITY_FLOW_STAGE_SIZE } from '@/components/identity-flow';
import { theme } from '@/lib/theme';

export const accountInviteEntryStyles = StyleSheet.create({
  rememberedBody: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  rememberedMain: {
    gap: theme.spacing.sm,
    position: 'relative',
    width: '100%',
  },
  rememberedProfile: {
    alignItems: 'center',
    width: '100%',
  },
  rememberedProfileMotion: {
    gap: theme.spacing.xs,
    width: '100%',
  },
  authIdentityStage: {
    height: IDENTITY_FLOW_STAGE_SIZE,
    position: 'relative',
    width: '100%',
  },
  authIdentityLayer: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  socialActions: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  authSecondaryBlock: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xl,
    width: '100%',
  },
  passwordFieldGroup: {
    gap: theme.spacing.xxs,
    width: '100%',
  },
  recoveryCodeBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
  },
  recoveryCodeHelp: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  recoveryResendButton: {
    borderRadius: theme.radius.pill,
    minHeight: 28,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xxs,
  },
  recoveryResendText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  forgotPasswordInline: {
    alignSelf: 'flex-end',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    minHeight: 24,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 0,
  },
  forgotPasswordInlineLifted: {
    transform: [{ translateY: -4 }],
  },
  forgotPasswordInlineText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  logoCopyPressable: {
    borderRadius: theme.radius.medium,
  },
  socialProviderRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
  },
  socialProviderButton: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  socialProviderButtonFull: {
    flexGrow: 1,
  },
  appleProviderButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  googleProviderButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  socialProviderText: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  appleProviderText: {
    color: theme.colors.white,
  },
  pressed: {
    opacity: 0.84,
  },
  actionDisabled: {
    opacity: 0.58,
  },
});
