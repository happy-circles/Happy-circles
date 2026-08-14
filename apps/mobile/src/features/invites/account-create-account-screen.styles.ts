import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

const COUNTRY_OPTION_HEIGHT = 42;
const COUNTRY_MENU_HEIGHT = COUNTRY_OPTION_HEIGHT * 4;

export const accountCreateAccountStyles = StyleSheet.create({
  messageBlock: {
    gap: theme.spacing.md,
  },
  verificationActions: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  socialProviderStack: {
    gap: theme.spacing.sm,
  },
  socialProviderButton: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
  },
  socialProviderButtonApple: {
    backgroundColor: theme.colors.appleButton,
    borderColor: theme.colors.appleButton,
  },
  socialProviderButtonGoogle: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  socialProviderButtonTextApple: {
    color: theme.colors.white,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  socialProviderButtonTextGoogle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  legalNotice: {
    fontSize: theme.typography.caption,
    lineHeight: 18,
    paddingHorizontal: theme.spacing.xs,
    textAlign: 'center',
  },
  legalNoticeLink: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
  emailPasswordFallback: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
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
    backgroundColor: theme.colors.successSoft,
    borderColor: theme.colors.successSoft,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    height: 56,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: theme.spacing.xs,
  },
  countryFlag: {
    fontSize: 17,
    lineHeight: 21,
  },
  callingCodeText: {
    color: theme.colors.brandNavy,
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 20,
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
    maxHeight: COUNTRY_MENU_HEIGHT,
    overflow: 'hidden',
    position: 'absolute',
    top: '100%',
    width: 220,
    zIndex: 30,
    ...theme.shadow.floating,
  },
  countryMenuSpacer: {
    height: COUNTRY_MENU_HEIGHT + theme.spacing.xs,
  },
  countryMenuScroll: {
    maxHeight: COUNTRY_MENU_HEIGHT,
  },
  countryMenuScrollbarTrack: {
    backgroundColor: theme.colors.successSoft,
    borderRadius: theme.radius.pill,
    bottom: theme.spacing.xxs,
    position: 'absolute',
    right: theme.spacing.xxs,
    top: theme.spacing.xxs,
    width: 4,
  },
  countryMenuScrollbarThumb: {
    backgroundColor: theme.colors.brandGreen,
    borderRadius: theme.radius.pill,
    width: 4,
  },
  countryOption: {
    alignItems: 'center',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: COUNTRY_OPTION_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
  },
  countryOptionSelected: {
    backgroundColor: theme.colors.successSoft,
  },
  countryOptionLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  countryOptionLast: {
    borderBottomWidth: 0,
  },
  countryLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    flexShrink: 1,
  },
  countryCode: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    marginLeft: theme.spacing.sm,
  },
  countryCodeSelected: {
    color: theme.colors.brandGreen,
  },
  pressed: {
    opacity: 0.9,
  },
  disabledAction: {
    opacity: 0.58,
  },
});
