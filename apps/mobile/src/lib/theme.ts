import { Platform } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeScheme = 'light' | 'dark';

export const THEME_PREFERENCE_STORAGE_KEY = 'happy-circles:theme-preference:v1';

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

export function resolveThemeScheme(
  preference: ThemePreference,
  systemScheme: ThemeScheme | null | undefined,
): ThemeScheme {
  return preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
}

export const themeBase = {
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
    small: 14,
    tiny: 10,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
    xxl: 40,
  },
};

const brandColors = {
  brandNavy: '#1a2744',
  brandGreen: '#3dba6e',
  brandCoral: '#e8604a',
};

export const lightTheme = {
  scheme: 'light',
  colors: {
    background: '#fbfcff',
    canvas: '#f3f7f5',
    surface: '#ffffff',
    elevated: '#ffffff',
    surfaceMuted: '#f6f8fb',
    surfaceSoft: '#edf5f0',
    border: 'rgba(15, 23, 40, 0.08)',
    hairline: 'rgba(15, 23, 40, 0.06)',
    text: '#0f1728',
    textMuted: '#667085',
    muted: '#98a2b3',
    ...brandColors,
    primary: '#1a2744',
    primaryStrong: '#10182b',
    primarySoft: '#e9edf5',
    primaryGhost: 'rgba(26, 39, 68, 0.08)',
    accent: '#dfe5ef',
    accentSoft: '#f2f4f8',
    success: '#3dba6e',
    successSoft: '#e8f8ef',
    warning: '#f97316',
    warningSoft: '#ffedd5',
    danger: '#e8604a',
    dangerSoft: '#fceae7',
    white: '#ffffff',
    whiteAlphaStrong: 'rgba(255, 255, 255, 0.82)',
    black: '#000000',
    transparent: 'rgba(0, 0, 0, 0)',
    onPrimary: '#ffffff',
    cycle: '#2563eb',
    cycleSoft: '#eaf1ff',
    pending: '#ca8a04',
    pendingSoft: '#fef3c7',
    treasure: '#f5a400',
    treasureSoft: '#fff4ce',
    appleButton: '#111111',
    overlay: 'rgba(15, 23, 40, 0.24)',
    scrim: 'rgba(247, 248, 251, 0.72)',
    halo: 'rgba(20, 30, 51, 0.04)',
    haloStrong: 'rgba(15, 23, 40, 0.025)',
    inputGlass: 'rgba(255, 255, 255, 0.78)',
    floatingSurface: 'rgba(255, 255, 255, 0.88)',
    inverseOverlay: 'rgba(14, 20, 29, 0.78)',
    pressedOverlay: 'rgba(15, 23, 42, 0.18)',
  },
  palette: {
    avatar: ['#c026d3', '#047857', '#2563eb', '#334155', '#dc2626', '#7c3aed'],
    contactAvatar: ['#e11d48', '#ea580c', '#059669', '#0891b2', '#2563eb', '#9333ea'],
    notificationAvatar: ['#0f8a5f', '#2563eb', '#a35f19', '#7c3aed', '#b24338', '#141e33'],
    previewAvatar: ['#e8604a', '#3dba6e', '#2563eb', '#7c3aed', '#f59e0b', '#0f8a5f'],
    category: {
      food: { color: '#d33f2f', backgroundColor: '#fff0e8' },
      cycle: { color: '#2563eb', backgroundColor: '#eaf1ff' },
      fun: { color: '#7c3aed', backgroundColor: '#f0eaff' },
      transport: { color: '#a35f19', backgroundColor: '#fff4dd' },
      home: { color: '#0f8a5f', backgroundColor: '#e6f7ef' },
      other: { color: '#141e33', backgroundColor: '#e9edf5' },
    },
  },
  glass: {
    standardBorder: 'rgba(15, 23, 40, 0.075)',
    nativeStandardBorder: 'rgba(255, 255, 255, 0.72)',
    mutedBorder: 'rgba(15, 23, 40, 0.065)',
    nativeMutedBorder: 'rgba(255, 255, 255, 0.6)',
    accentBorder: 'rgba(15, 23, 40, 0.075)',
    nativeAccentBorder: 'rgba(255, 255, 255, 0.62)',
    fallbackBorder: 'rgba(15, 23, 40, 0.09)',
    fallbackBorderStrong: 'rgba(15, 23, 40, 0.11)',
    fallbackInnerEdge: 'rgba(255, 255, 255, 0.9)',
    background: 'rgba(255, 255, 255, 0.82)',
    mutedBackground: 'rgba(255, 255, 255, 0.72)',
    accentBackground: 'rgba(255, 255, 255, 0.76)',
    flatBackground: 'rgba(255, 255, 255, 0.78)',
    flatMutedBackground: 'rgba(255, 255, 255, 0.68)',
    flatAccentBackground: 'rgba(255, 255, 255, 0.72)',
    flatSoftBackground: 'rgba(255, 255, 255, 0.74)',
    underlayBackground: 'rgba(255, 255, 255, 0.72)',
    underlayMutedBackground: 'rgba(255, 255, 255, 0.66)',
    underlayAccentBackground: 'rgba(255, 255, 255, 0.72)',
    flatUnderlayBackground: 'rgba(255, 255, 255, 0.72)',
    flatSoftUnderlayBackground: 'rgba(255, 255, 255, 0.68)',
    nativeBackground: 'rgba(255, 255, 255, 0.12)',
    nativeMutedBackground: 'rgba(255, 255, 255, 0.1)',
    nativeAccentBackground: 'rgba(255, 255, 255, 0.11)',
    nativeUnderlayBackground: 'rgba(255, 255, 255, 0.08)',
    nativeMutedUnderlayBackground: 'rgba(255, 255, 255, 0.07)',
    nativeAccentUnderlayBackground: 'rgba(255, 255, 255, 0.08)',
    tint: 'rgba(255, 255, 255, 0.04)',
    softTint: 'rgba(255, 255, 255, 0.14)',
    strongEdge: 'rgba(255, 255, 255, 0.86)',
    softEdge: 'rgba(255, 255, 255, 0.72)',
    topGlow: 'rgba(255, 255, 255, 0.76)',
    nativeTopGlow: 'rgba(255, 255, 255, 0.22)',
    topGlowOpacity: 0.92,
    nativeTopGlowOpacity: 0.42,
    flatSheen: 'rgba(255, 255, 255, 0.42)',
    flatSheenOpacity: 0.8,
    flatDepth: 'rgba(15, 23, 40, 0.04)',
    fallbackDepth: 'rgba(15, 23, 40, 0.045)',
    fallbackDepthOpacity: 1,
    innerEdgeOpacity: 0.9,
    softInnerEdgeOpacity: 0.78,
    discSheen: 'rgba(255, 255, 255, 0.76)',
    webShadow:
      '0 0 0 1px rgba(15, 23, 40, 0.075), 0 18px 34px -24px rgba(15, 23, 40, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -1px 0 rgba(15, 23, 40, 0.035)',
    flatWebShadow:
      '0 0 0 1px rgba(15, 23, 40, 0.08), 0 16px 28px -24px rgba(15, 23, 40, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(15, 23, 40, 0.04)',
    flatSoftWebShadow:
      '0 0 0 1px rgba(15, 23, 40, 0.075), 0 14px 24px -22px rgba(15, 23, 40, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.88)',
    shadowColor: '#0f1728',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    flatSoftShadowOpacity: 0.1,
    flatSoftShadowRadius: 14,
    homeBackground: 'rgba(255, 255, 255, 0.94)',
    homeNativeBackground: 'rgba(255, 255, 255, 0.12)',
    homeFabBackground: 'rgba(255, 255, 255, 0.9)',
    homeNativeFabBackground: 'rgba(255, 255, 255, 0.1)',
    homeTopGlow: 'rgba(255, 255, 255, 0.82)',
    homeNativeTopGlow: 'rgba(255, 255, 255, 0.24)',
    homeTopGlowOpacity: 0.96,
    homeNativeTopGlowOpacity: 0.42,
    homeTint: 'rgba(255, 255, 255, 0.04)',
    homeWebShadow: '0 22px 54px rgba(15, 23, 40, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.86)',
    homeShadowColor: '#0f1728',
    homeShadowOpacity: 0.16,
    homeShadowRadius: 34,
  },
  ...themeBase,
  shadow: {
    card: Platform.select({
      web: {
        boxShadow: '0 10px 22px rgba(15, 23, 40, 0.08)',
      },
      ios: {
        shadowColor: '#0f1728',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 22,
      },
      default: {
        elevation: 3,
      },
    }),
    floating: Platform.select({
      web: {
        boxShadow: '0 18px 28px rgba(15, 23, 40, 0.14)',
      },
      ios: {
        shadowColor: '#0f1728',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.14,
        shadowRadius: 28,
      },
      default: {
        elevation: 7,
      },
    }),
  },
} as const;

export const darkTheme = {
  ...lightTheme,
  scheme: 'dark',
  colors: {
    ...lightTheme.colors,
    background: '#09111f',
    canvas: '#0d1728',
    surface: '#121d31',
    elevated: '#17243a',
    surfaceMuted: '#0f1a2d',
    surfaceSoft: '#18263d',
    border: 'rgba(226, 232, 240, 0.12)',
    hairline: 'rgba(226, 232, 240, 0.08)',
    text: '#f7f9fd',
    textMuted: '#aab6c8',
    muted: '#728197',
    primary: '#9fb7ff',
    primaryStrong: '#dbe5ff',
    primarySoft: 'rgba(159, 183, 255, 0.16)',
    primaryGhost: 'rgba(159, 183, 255, 0.12)',
    accent: '#263650',
    accentSoft: '#17243a',
    success: '#64d98e',
    successSoft: 'rgba(100, 217, 142, 0.14)',
    warning: '#fb923c',
    warningSoft: 'rgba(251, 146, 60, 0.16)',
    danger: '#ff806d',
    dangerSoft: 'rgba(255, 128, 109, 0.16)',
    whiteAlphaStrong: 'rgba(255, 255, 255, 0.82)',
    onPrimary: '#08111f',
    cycle: '#82a8ff',
    cycleSoft: 'rgba(130, 168, 255, 0.16)',
    pending: '#facc15',
    pendingSoft: 'rgba(250, 204, 21, 0.16)',
    treasureSoft: 'rgba(245, 164, 0, 0.18)',
    overlay: 'rgba(3, 7, 18, 0.58)',
    scrim: 'rgba(3, 7, 18, 0.68)',
    halo: 'rgba(226, 232, 240, 0.04)',
    haloStrong: 'rgba(226, 232, 240, 0.03)',
    inputGlass: 'rgba(18, 29, 49, 0.82)',
    floatingSurface: 'rgba(18, 29, 49, 0.9)',
    inverseOverlay: 'rgba(3, 7, 18, 0.82)',
    pressedOverlay: 'rgba(226, 232, 240, 0.12)',
    brandNavy: '#ffffff',
  },
  palette: {
    avatar: ['#d946ef', '#34d399', '#82a8ff', '#94a3b8', '#fb7185', '#a78bfa'],
    contactAvatar: ['#fb7185', '#fb923c', '#34d399', '#22d3ee', '#82a8ff', '#c084fc'],
    notificationAvatar: ['#34d399', '#82a8ff', '#f59e0b', '#a78bfa', '#ff806d', '#cbd5e1'],
    previewAvatar: ['#ff806d', '#64d98e', '#82a8ff', '#a78bfa', '#fbbf24', '#34d399'],
    category: {
      food: { color: '#ff806d', backgroundColor: 'rgba(255, 128, 109, 0.16)' },
      cycle: { color: '#82a8ff', backgroundColor: 'rgba(130, 168, 255, 0.16)' },
      fun: { color: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.16)' },
      transport: { color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.16)' },
      home: { color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.16)' },
      other: { color: '#cbd5e1', backgroundColor: 'rgba(203, 213, 225, 0.14)' },
    },
  },
  glass: {
    standardBorder: 'rgba(226, 232, 240, 0.06)',
    nativeStandardBorder: 'rgba(226, 232, 240, 0.06)',
    mutedBorder: 'rgba(226, 232, 240, 0.05)',
    nativeMutedBorder: 'rgba(226, 232, 240, 0.05)',
    accentBorder: 'rgba(226, 232, 240, 0.06)',
    nativeAccentBorder: 'rgba(226, 232, 240, 0.06)',
    fallbackBorder: 'rgba(226, 232, 240, 0.06)',
    fallbackBorderStrong: 'rgba(226, 232, 240, 0.07)',
    fallbackInnerEdge: 'rgba(226, 232, 240, 0)',
    background: 'rgba(18, 29, 49, 0.32)',
    mutedBackground: 'rgba(15, 26, 45, 0.3)',
    accentBackground: 'rgba(23, 36, 58, 0.32)',
    flatBackground: 'rgba(18, 29, 49, 0.3)',
    flatMutedBackground: 'rgba(15, 26, 45, 0.28)',
    flatAccentBackground: 'rgba(23, 36, 58, 0.3)',
    flatSoftBackground: 'rgba(23, 36, 58, 0.26)',
    underlayBackground: 'rgba(18, 29, 49, 0.24)',
    underlayMutedBackground: 'rgba(15, 26, 45, 0.22)',
    underlayAccentBackground: 'rgba(23, 36, 58, 0.24)',
    flatUnderlayBackground: 'rgba(18, 29, 49, 0.24)',
    flatSoftUnderlayBackground: 'rgba(23, 36, 58, 0.22)',
    nativeBackground: 'rgba(18, 29, 49, 0.32)',
    nativeMutedBackground: 'rgba(15, 26, 45, 0.3)',
    nativeAccentBackground: 'rgba(23, 36, 58, 0.32)',
    nativeUnderlayBackground: 'rgba(18, 29, 49, 0.24)',
    nativeMutedUnderlayBackground: 'rgba(15, 26, 45, 0.22)',
    nativeAccentUnderlayBackground: 'rgba(23, 36, 58, 0.24)',
    tint: 'rgba(18, 29, 49, 0.1)',
    softTint: 'rgba(23, 36, 58, 0.22)',
    strongEdge: 'rgba(226, 232, 240, 0.1)',
    softEdge: 'rgba(226, 232, 240, 0.07)',
    topGlow: 'rgba(226, 232, 240, 0.08)',
    nativeTopGlow: 'rgba(226, 232, 240, 0.1)',
    topGlowOpacity: 0,
    nativeTopGlowOpacity: 0,
    flatSheen: 'rgba(226, 232, 240, 0.08)',
    flatSheenOpacity: 0,
    flatDepth: 'rgba(0, 0, 0, 0.1)',
    fallbackDepth: 'rgba(0, 0, 0, 0.12)',
    fallbackDepthOpacity: 1,
    innerEdgeOpacity: 0,
    softInnerEdgeOpacity: 0,
    discSheen: 'rgba(226, 232, 240, 0.12)',
    webShadow: '0 18px 28px -18px rgba(0, 0, 0, 0.52)',
    flatWebShadow: '0 16px 24px -18px rgba(0, 0, 0, 0.48)',
    flatSoftWebShadow: '0 14px 22px -18px rgba(0, 0, 0, 0.44)',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 13,
    flatSoftShadowOpacity: 0.22,
    flatSoftShadowRadius: 12,
    homeBackground: 'rgba(18, 29, 49, 0.82)',
    homeNativeBackground: 'rgba(18, 29, 49, 0.32)',
    homeFabBackground: 'rgba(18, 29, 49, 0.86)',
    homeNativeFabBackground: 'rgba(15, 26, 45, 0.3)',
    homeTopGlow: 'rgba(226, 232, 240, 0.08)',
    homeNativeTopGlow: 'rgba(226, 232, 240, 0.1)',
    homeTopGlowOpacity: 0,
    homeNativeTopGlowOpacity: 0,
    homeTint: 'rgba(18, 29, 49, 0.1)',
    homeWebShadow: '0 22px 54px rgba(0, 0, 0, 0.38)',
    homeShadowColor: '#000000',
    homeShadowOpacity: 0.3,
    homeShadowRadius: 34,
  },
  shadow: {
    card: Platform.select({
      web: {
        boxShadow: '0 10px 22px rgba(0, 0, 0, 0.28)',
      },
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.24,
        shadowRadius: 22,
      },
      default: {
        elevation: 3,
      },
    }),
    floating: Platform.select({
      web: {
        boxShadow: '0 18px 28px rgba(0, 0, 0, 0.36)',
      },
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.3,
        shadowRadius: 28,
      },
      default: {
        elevation: 7,
      },
    }),
  },
} as const;

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export type AppTheme = (typeof themes)[ThemeScheme];

let runtimeTheme: AppTheme = lightTheme;

export function setRuntimeThemeScheme(scheme: ThemeScheme): void {
  runtimeTheme = themes[scheme];
}

export function getRuntimeTheme(): AppTheme {
  return runtimeTheme;
}

export const theme = new Proxy(lightTheme, {
  get(_target, property: keyof AppTheme) {
    return runtimeTheme[property];
  },
}) as AppTheme;
