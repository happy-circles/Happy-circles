import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from '@happy-circles/shared';

import { appConfig } from './config';
import { installNativeWebCryptoShim } from './native-webcrypto';
import { createPublicEdgeFetch } from './public-edge-fetch';
import { authStorageAdapter } from './storage';

installNativeWebCryptoShim();

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

/**
 * Least-privilege client for explicitly public Edge Functions. Supabase adds
 * the project API key to every request; the fetch override prevents it from
 * also being mirrored into `Authorization: Bearer ...`.
 */
export const publicEdgeSupabase =
  appConfig.supabaseUrl && appConfig.supabaseAnonKey
    ? createClient<Database>(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
        // Avoid creating a second auth/session listener for this functions-only client.
        accessToken: async () => null,
        global: {
          fetch: createPublicEdgeFetch(),
        },
      })
    : null;
