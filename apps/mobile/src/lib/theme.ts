import { Platform } from 'react-native';

export const theme = {
  colors: {
    background: '#f5f1e9',
    surface: '#fffdf9',
    elevated: '#ffffff',
    surfaceMuted: '#efe7d9',
    border: '#e1d7c8',
    hairline: 'rgba(44, 34, 20, 0.10)',
    text: '#1d1a14',
    textMuted: '#6d6558',
    muted: '#8d8578',
    primary: '#1f6f63',
    primarySoft: '#dcefe9',
    accent: '#1f6f63',
    accentSoft: '#dcefe9',
    success: '#277951',
    successSoft: '#dbf0e4',
    warning: '#9f6f16',
    warningSoft: '#f4ead1',
    danger: '#b34d3d',
    dangerSoft: '#f8e1dc',
    white: '#ffffff',
    overlay: 'rgba(24, 19, 12, 0.16)',
  },
  typography: {
    largeTitle: 34,
    title1: 28,
    title2: 22,
    title3: 19,
    body: 16,
    callout: 15,
    footnote: 13,
    caption: 12,
  },
  radius: {
    pill: 999,
    xlarge: 32,
    large: 24,
    medium: 18,
    small: 12,
    tiny: 8,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  shadow: {
    card: Platform.select({
      ios: {
        shadowColor: '#20170d',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      default: {
        elevation: 2,
      },
    }),
    floating: Platform.select({
      ios: {
        shadowColor: '#20170d',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.14,
        shadowRadius: 28,
      },
      default: {
        elevation: 4,
      },
    }),
  },
};
