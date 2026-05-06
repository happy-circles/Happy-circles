import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const accountInviteStyles = StyleSheet.create({
  activationBody: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  activationMain: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  activationForm: {
    gap: theme.spacing.sm,
  },
  detailValue: {
    gap: 2,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  detailTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  detailSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  body: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    lineHeight: 22,
    paddingHorizontal: theme.spacing.xs,
  },
  actionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: theme.spacing.xs,
    textAlign: 'center',
  },
  actionStack: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  secondaryActionFullWidth: {
    alignSelf: 'stretch',
    borderRadius: theme.radius.medium,
    minWidth: 0,
    width: '100%',
  },
});
