import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@happy-circles/shared';

export interface SupabaseClientOptions {
  readonly url: string;
  readonly anonKey: string;
}

export function createSupabaseBrowserClient(
  options: SupabaseClientOptions,
): SupabaseClient<Database> {
  return createClient<Database>(options.url, options.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
