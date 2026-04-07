import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@happy-circles/shared';

import { appConfig } from './config';

const authStorage =
  typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;

export const supabase =
  appConfig.supabaseUrl && appConfig.supabaseAnonKey
    ? createClient<Database>(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
