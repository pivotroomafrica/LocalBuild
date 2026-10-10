import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cookie-less, session-less Supabase client acting as the `anon` role.
 * Only for PUBLIC reads that are identical for every visitor (published
 * expert directory/profiles), which is what makes them safe to cache and
 * share across users -- a cookie-bound client must never be used inside a
 * shared cache. Uses the public anon key only; never the service role.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
