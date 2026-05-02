import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as
  | {
      readonly supabaseUrl?: string;
      readonly supabaseAnonKey?: string;
      readonly appWebOrigin?: string;
      readonly authRedirectMode?: string;
    }
  | undefined;

function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  const value = values.find((candidate) => candidate?.trim());
  return value?.trim() ?? '';
}

export const appConfig = {
  supabaseUrl: firstNonEmpty(extra?.supabaseUrl, process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey:
    firstNonEmpty(
      extra?.supabaseAnonKey,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  appWebOrigin:
    extra?.appWebOrigin ??
    process.env.EXPO_PUBLIC_APP_WEB_ORIGIN ??
    'https://app.happy-circles.com',
  authRedirectMode:
    extra?.authRedirectMode ?? process.env.EXPO_PUBLIC_AUTH_REDIRECT_MODE ?? 'universal-link',
};
