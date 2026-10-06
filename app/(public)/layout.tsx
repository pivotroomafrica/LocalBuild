import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getCategoryNamesForRequest, getDirectoryForRequest } from "@/lib/public/cached";
import { SiteChrome } from "@/components/site/SiteChrome";
import { SiteFooter } from "@/components/site/SiteFooter";
import "./intro-theme.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

/**
 * Route group -- (public) is stripped from the URL, so this wraps `/`,
 * `/experts`, `/experts/[slug]`, and `/become-an-expert` in the public-site
 * theme (intro-theme.css, scoped under .intro-theme so dashboards, admin and
 * auth keep their own styling).
 *
 * Reads the CURRENT request's auth state (cookies -- a signed-in visitor
 * never sees Sign up / Log in) plus the real published-only directory and
 * category list once, shared by the header's search modal and the footer.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    experts,
    categories,
  ] = await Promise.all([supabase.auth.getUser(), getDirectoryForRequest(), getCategoryNamesForRequest()]);

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
    <div className={`intro-theme ${jakarta.variable} ${newsreader.variable} flex min-h-screen flex-col`}>
      <SiteChrome isLoggedIn={Boolean(user)} isApprovedExpert={isApprovedExpert} experts={experts} categories={categories} />
      <main className="flex-1">{children}</main>
      <SiteFooter categories={categories} />
    </div>
  );
}
