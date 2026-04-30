import type { ExpoConfig } from 'expo/config';

const appWebOrigin = process.env.EXPO_PUBLIC_APP_WEB_ORIGIN ?? 'https://app.happy-circles.com';
const authRedirectMode = process.env.EXPO_PUBLIC_AUTH_REDIRECT_MODE ?? 'universal-link';
const appLinkPathPrefixes = ['/invite', '/join', '/reset-password', '/setup-account', '/sign-in'];
const appWebHost = (() => {
  try {
    return new URL(appWebOrigin).host;
  } catch {
    return 'app.happy-circles.com';
  }
})();

const config: ExpoConfig = {
  name: 'Happy Circles',
  slug: 'happy-circles',
  scheme: 'happycircles',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-asset',
    'expo-sqlite',
    'expo-secure-store',
    'expo-local-authentication',
    'expo-notifications',
    'expo-apple-authentication',
    [
      'expo-contacts',
      {
        contactsPermission:
          'Happy Circles usa tus contactos solo para ayudarte a asociar una invitacion privada a la persona correcta.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Happy Circles usa la camara para escanear codigos QR de invitacion.',
      },
    ],
    [
      'expo-web-browser',
      {
        experimentalLauncherActivity: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    bundleIdentifier: 'com.happycircles.app',
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${appWebHost}`],
    infoPlist: {
      NSCameraUsageDescription: 'Use the camera to scan QR invitations in Happy Circles.',
      NSFaceIDUsageDescription: 'Use Face ID to unlock Happy Circles quickly and securely.',
    },
  },
  android: {
    package: 'com.happycircles.app',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: appLinkPathPrefixes.map((pathPrefix) => ({
          scheme: 'https',
          host: appWebHost,
          pathPrefix,
        })),
      },
    ],
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      '',
    appWebOrigin,
    authRedirectMode,
  },
};

export default config;
