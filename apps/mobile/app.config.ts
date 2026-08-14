import { existsSync } from 'node:fs';
import process from 'node:process';
import type { ExpoConfig } from 'expo/config';

function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  const value = values.find((candidate) => candidate?.trim());
  return value?.trim() ?? '';
}

const env = process.env;
const appWebOrigin = env.EXPO_PUBLIC_APP_WEB_ORIGIN ?? 'https://app.happy-circles.com';
const authRedirectMode = env.EXPO_PUBLIC_AUTH_REDIRECT_MODE ?? 'universal-link';
const authDebugEnabled = firstNonEmpty(env.EXPO_PUBLIC_AUTH_DEBUG);
const appLinkPathPrefixes = ['/invite/', '/join', '/reset-password', '/setup-account'];
const appVersion = env.EXPO_PUBLIC_APP_VERSION ?? '1.0.2';
const iosBuildNumber = env.IOS_BUILD_NUMBER ?? '37';
const androidVersionCode = Number.parseInt(env.ANDROID_VERSION_CODE ?? '22', 10);
const includeDevClient =
  env.EXPO_PUBLIC_INCLUDE_DEV_CLIENT === '1' || env.EAS_BUILD_PROFILE === 'development';
const splashBackgroundColor = '#fbfcff';
const splashDarkBackgroundColor = '#09111f';
const splashImageWidth = 208;
const supabaseUrl = firstNonEmpty(env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = firstNonEmpty(
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
const googleWebClientId = firstNonEmpty(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
const googleIosClientId = firstNonEmpty(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
const googleAndroidClientId = firstNonEmpty(env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID);
const googleServicesFile = './google-services.json';
const androidGoogleServicesFile = existsSync(googleServicesFile) ? googleServicesFile : null;
const appWebHost = (() => {
  try {
    return new URL(appWebOrigin).host;
  } catch {
    return 'app.happy-circles.com';
  }
})();

function resolveGoogleIosUrlScheme(clientId: string): string {
  const suffix = '.apps.googleusercontent.com';

  if (!clientId.endsWith(suffix)) {
    return '';
  }

  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

const googleIosUrlScheme = resolveGoogleIosUrlScheme(googleIosClientId);
const googleSignInPlugin: [string, { readonly iosUrlScheme: string }] | null = googleIosUrlScheme
  ? [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: googleIosUrlScheme,
      },
    ]
  : null;

const config: ExpoConfig = {
  name: 'Happy Circles',
  slug: 'happy-circles',
  owner: 'happy-circles',
  scheme: 'happycircles',
  version: appVersion,
  icon: './assets/app-icon.png',
  orientation: 'portrait',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: splashBackgroundColor,
  },
  userInterfaceStyle: 'automatic',
  plugins: [
    './plugins/with-ios-modular-headers.cjs',
    'expo-router',
    ...(includeDevClient ? ['expo-dev-client'] : []),
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: splashImageWidth,
        resizeMode: 'contain',
        backgroundColor: splashBackgroundColor,
        dark: {
          image: './assets/splash-icon-dark.png',
          backgroundColor: splashDarkBackgroundColor,
        },
      },
    ],
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
          'Happy Circles usa tus contactos para encontrar personas que ya conoces.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Happy Circles usa la cámara para escanear códigos QR de invitación.',
      },
    ],
    [
      'expo-web-browser',
      {
        experimentalLauncherActivity: false,
      },
    ],
    ...(googleSignInPlugin ? [googleSignInPlugin] : []),
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    bundleIdentifier: 'com.happycircles.app',
    buildNumber: iosBuildNumber,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${appWebHost}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'Happy Circles usa la cámara para escanear invitaciones QR y actualizar tu foto de perfil.',
      NSContactsUsageDescription:
        'Happy Circles usa tus contactos para encontrar personas que ya conoces.',
      NSFaceIDUsageDescription:
        'Happy Circles usa Face ID para proteger cambios sensibles de tu cuenta.',
      NSPhotoLibraryUsageDescription:
        'Happy Circles usa tus fotos solo cuando eliges actualizar tu foto de perfil.',
      NSPhotoLibraryAddUsageDescription:
        'Happy Circles puede guardar imagenes cuando tu eliges compartirlas desde la app.',
    },
  },
  android: {
    package: 'com.happycircles.app',
    ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
    softwareKeyboardLayoutMode: 'resize',
    versionCode: Number.isFinite(androidVersionCode) ? androidVersionCode : 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: splashBackgroundColor,
    },
    blockedPermissions: ['android.permission.WRITE_CONTACTS', 'android.permission.RECORD_AUDIO'],
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
    eas: {
      projectId: '9b63f5f3-3c81-4d3d-bc54-1a81b998d20a',
    },
    supabaseUrl,
    supabaseAnonKey,
    appWebOrigin,
    authRedirectMode,
    authDebugEnabled,
    googleWebClientId,
    googleIosClientId,
    googleAndroidClientId,
  },
};

export default config;
