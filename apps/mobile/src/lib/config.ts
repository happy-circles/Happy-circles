import Constants from 'expo-constants';

interface AppConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly appWebOrigin: string;
  readonly authRedirectMode: string;
  readonly authDebugEnabled: string;
  readonly googleWebClientId: string;
  readonly googleIosClientId: string;
  readonly googleAndroidClientId: string;
}

interface ExpoExtraConfig {
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
  readonly appWebOrigin?: string;
  readonly authRedirectMode?: string;
  readonly authDebugEnabled?: string;
  readonly googleWebClientId?: string;
  readonly googleIosClientId?: string;
  readonly googleAndroidClientId?: string;
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const extra = Constants.expoConfig?.extra as ExpoExtraConfig | undefined;
const runtimeEnv =
  (globalThis as { readonly process?: { readonly env?: RuntimeEnvironment } }).process?.env ?? {};

function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  const value = values.find((candidate) => candidate?.trim());
  return value?.trim() ?? '';
}

export const appConfig: AppConfig = {
  supabaseUrl: firstNonEmpty(extra?.supabaseUrl, runtimeEnv.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: firstNonEmpty(
    extra?.supabaseAnonKey,
    runtimeEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    runtimeEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  appWebOrigin:
    extra?.appWebOrigin ?? runtimeEnv.EXPO_PUBLIC_APP_WEB_ORIGIN ?? 'https://app.happy-circles.com',
  authRedirectMode:
    extra?.authRedirectMode ?? runtimeEnv.EXPO_PUBLIC_AUTH_REDIRECT_MODE ?? 'universal-link',
  authDebugEnabled: firstNonEmpty(extra?.authDebugEnabled, runtimeEnv.EXPO_PUBLIC_AUTH_DEBUG),
  googleWebClientId: firstNonEmpty(
    extra?.googleWebClientId,
    runtimeEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ),
  googleIosClientId: firstNonEmpty(
    extra?.googleIosClientId,
    runtimeEnv.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  ),
  googleAndroidClientId: firstNonEmpty(
    extra?.googleAndroidClientId,
    runtimeEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  ),
};
