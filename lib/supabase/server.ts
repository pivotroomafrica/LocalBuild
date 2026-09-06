import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the auth session via Next.js cookies so the
 * authenticated user is available on the server.
 *
 * Server Components cannot write cookies, so the `setAll` call below will
 * throw when called from one. That's expected and safe to ignore as long as
 * `proxy.ts` (see lib/supabase/middleware.ts) refreshes the session on every
 * request — see the Supabase SSR docs for this exact pattern.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — session refresh is handled
            // by proxy.ts instead.
          }
        },
      },
    },
  );
}
