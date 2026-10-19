import { createClient } from "@/lib/supabase/server";
import { SiteChrome } from "@/components/site/SiteChrome";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * Route group -- (public) is stripped from the URL, so this wraps the
 * public website in its header, footer and mobile tab bar (app/site.css,
 * scoped under .pr). Reads the CURRENT request's auth state, so a
 * signed-in visitor sees their account menu instead of Sign in.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isApprovedExpert = false;
  if (user) {
    const { data: expertProfile } = await supabase
      .from("expert_profiles")
      .select("application_status")
      .eq("user_id", user.id)
      .maybeSingle();
    isApprovedExpert = expertProfile?.application_status === "approved";
  }

  return (
    <div className="pr has-tabbar flex min-h-screen flex-col">
      <SiteChrome isLoggedIn={Boolean(user)} isApprovedExpert={isApprovedExpert} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
