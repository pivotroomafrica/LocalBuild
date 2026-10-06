import { createClient } from "@/lib/supabase/server";
import { AppHeaderClient, type AppNavLink } from "@/components/app/AppHeaderClient";

/**
 * Signed-in workspace header (dashboard, expert area, admin) in the same
 * dark sticky intro style as the public site nav. Links are derived from
 * the CURRENT user's real role/application state -- an expert link only
 * appears for someone who actually has an expert application, an admin
 * link only for profiles.role = 'admin'. Route protection itself still
 * lives in each page's require*Page helper; this is navigation only.
 */
export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let isAdmin = false;
  let expertStatus: string | null = null;

  if (user) {
    const [{ data: profile }, { data: expertProfile }] = await Promise.all([
      supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(),
      supabase.from("expert_profiles").select("application_status").eq("user_id", user.id).maybeSingle(),
    ]);
    displayName = profile?.full_name ?? user.email ?? null;
    isAdmin = profile?.role === "admin";
    expertStatus = expertProfile?.application_status ?? null;
  }

  const links: AppNavLink[] = [
    { href: "/experts", label: "Browse Experts", match: "/experts" },
    { href: "/dashboard", label: "My Sessions", match: "/dashboard" },
    ...(expertStatus === "approved"
      ? [{ href: "/expert/dashboard", label: "Expert Dashboard", match: "/expert/(dashboard|sessions|availability)" }]
      : expertStatus
        ? [{ href: "/expert/application", label: "Expert Application", match: "/expert/application" }]
        : []),
    ...(isAdmin ? [{ href: "/admin/experts", label: "Admin", match: "/admin" }] : []),
  ];

  return <AppHeaderClient links={links} displayName={displayName} />;
}
