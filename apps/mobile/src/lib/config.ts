import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as
  | {
      readonly supabaseUrl?: string;
      readonly supabaseAnonKey?: string;
    }
  | undefined;

export const appConfig = {
  supabaseUrl: extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey:
    extra?.supabaseAnonKey ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    '',
};

export const useMockData = !appConfig.supabaseUrl || !appConfig.supabaseAnonKey;
