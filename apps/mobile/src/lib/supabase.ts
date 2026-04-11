import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from '@happy-circles/shared';

import { appConfig } from './config';
import { authStorageAdapter } from './storage';

const authStorage =
  Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined'
    ? globalThis.localStorage
    : authStorageAdapter;

export const supabase =
  appConfig.supabaseUrl && appConfig.supabaseAnonKey
    ? createClient<Database>(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;
