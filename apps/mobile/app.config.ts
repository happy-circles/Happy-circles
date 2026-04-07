import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Happy Circles',
  slug: 'happy-circles',
  scheme: 'happycircles',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: ['expo-router', 'expo-asset', 'expo-sqlite'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      '',
  },
};

export default config;
