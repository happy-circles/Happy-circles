import Constants from 'expo-constants';

interface AppConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly appWebOrigin: string;
  readonly authRedirectMode: string;
}

interface ExpoExtraConfig {
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
  readonly appWebOrigin?: string;
  readonly authRedirectMode?: string;
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
};
