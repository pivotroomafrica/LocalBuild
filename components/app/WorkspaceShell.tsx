import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";
import { SiteLogo } from "@/components/site/SiteChrome";
import { initialsOf } from "@/components/site/format";
import { WorkspaceSidebarNav, type SidebarItem } from "@/components/app/WorkspaceSidebarNav";

export type WorkspaceArea = "client" | "expert" | "admin";

function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/**
 * Signed-in workspace frame (website design): a plain header and a left
 * sidebar with who you are and the sections of this area; admin uses the
 * dark sidebar. Links come from the CURRENT user's real role and expert
 * application -- route protection still lives in each page's require*
 * helper; this is navigation only.
 */
export async function WorkspaceShell({ area, children }: { area: WorkspaceArea; children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let fullName = user?.email ?? "";
  let isAdmin = false;
  let memberSince: string | null = null;
  let expert: {
    application_status: string;
    profile_status: string;
    slug: string;
    approved_at: string | null;
  } | null = null;
  let adminCounts = { applications: 0, payments: 0 };

  if (user) {
    const [{ data: profile }, { data: expertProfile }] = await Promise.all([
      supabase.from("profiles").select("full_name, role, created_at").eq("id", user.id).maybeSingle(),
      supabase
        .from("expert_profiles")
        .select("application_status, profile_status, slug, approved_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    fullName = profile?.full_name || fullName;
    isAdmin = profile?.role === "admin";
    memberSince = profile?.created_at ?? null;
    expert = expertProfile;

    if (area === "admin" && isAdmin) {
      const [{ count: applications }, { count: payments }] = await Promise.all([
        supabase.from("expert_profiles").select("id", { count: "exact", head: true }).eq("application_status", "submitted"),
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .in("payment_status", ["pending_verification", "requires_review"]),
      ]);
      adminCounts = { applications: applications ?? 0, payments: payments ?? 0 };
    }
  }

  const isApprovedExpert = expert?.application_status === "approved";

  let items: SidebarItem[];
  let subtitle: string | null;
  if (area === "admin") {
    items = [
      { href: "/admin", label: "Overview", icon: "space_dashboard", exact: true },
      { href: "/admin/experts", label: "Applications", icon: "how_to_reg", badge: adminCounts.applications },
      { href: "/admin/bookings", label: "Bookings", icon: "event" },
      { href: "/admin/payments", label: "Payments", icon: "payments", badge: adminCounts.payments },
    ];
    subtitle = "Admin";
  } else if (area === "expert" && isApprovedExpert) {
    items = [
      { href: "/expert/dashboard", label: "Overview", icon: "space_dashboard" },
      { href: "/expert/sessions", label: "Sessions", icon: "event" },
      { href: "/expert/availability", label: "Availability", icon: "schedule" },
      { href: "/expert/earnings", label: "Earnings", icon: "account_balance_wallet" },
      { href: "/expert/application", label: "Profile", icon: "badge" },
    ];
    subtitle = sinceLabel(expert?.approved_at) ? `Expert since ${sinceLabel(expert?.approved_at)}` : "Expert";
  } else if (area === "expert") {
    items = [{ href: "/expert/application", label: "Your application", icon: "assignment" }];
    subtitle = "Expert applicant";
  } else {
    items = [
      { href: "/dashboard", label: "Overview", icon: "space_dashboard", exact: true },
      { href: "/dashboard/sessions", label: "Sessions", icon: "event" },
      { href: "/dashboard/payments", label: "Payments", icon: "payments" },
      { href: "/dashboard/profile", label: "Profile", icon: "person" },
    ];
    subtitle = sinceLabel(memberSince) ? `Client since ${sinceLabel(memberSince)}` : null;
  }

  const switchTo: SidebarItem[] = [
    ...(area !== "client" ? [{ href: "/dashboard", label: "My sessions as a client", icon: "swap_horiz" }] : []),
    ...(area !== "expert" && expert
      ? [
          {
            href: isApprovedExpert ? "/expert/dashboard" : "/expert/application",
            label: isApprovedExpert ? "Expert dashboard" : "Expert application",
            icon: "work",
          },
        ]
      : []),
    ...(area !== "admin" && isAdmin ? [{ href: "/admin", label: "Admin", icon: "admin_panel_settings" }] : []),
  ];

  const dark = area === "admin";
  const publicProfileHref =
    area === "expert" && expert?.profile_status === "published" ? `/experts/${expert.slug}` : null;

  return (
    <div className={`pr ws ${dark ? "ws-dark" : ""}`}>
      <header className="pr-head ws-head">
        <div className="ws-bar">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <Link href="/" className="logo" aria-label="Pivotroom home">
              <SiteLogo tone={dark ? "white" : "ink"} />
            </Link>
            {area !== "client" ? <span className="ws-badge">{area === "admin" ? "Admin" : "Expert"}</span> : null}
          </span>
          {area === "client" ? (
            <Link href="/experts" className="btn btn-ink hide-sm">
              Find an expert{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          ) : publicProfileHref ? (
            <Link href={publicProfileHref} className="btn btn-line even">
              Public profile{" "}
              <span className="ms ao" aria-hidden="true">
                arrow_outward
              </span>
            </Link>
          ) : null}
        </div>
      </header>
      <div className="ws-body">
        <aside className="ws-side" aria-label="Workspace">
          <div className="ws-who">
            <span className="ws-av" aria-hidden="true">
              {initialsOf(fullName || "?")}
            </span>
            <span className="stack" style={{ minWidth: 0, lineHeight: 1.3 }}>
              <span className="ws-name">{fullName}</span>
              {subtitle ? <span className="ws-sub">{subtitle}</span> : null}
            </span>
          </div>
          <WorkspaceSidebarNav items={items} switchTo={switchTo} />
          <form action={signOutAction} className="ws-signout">
            <button type="submit" className="ws-link">
              <span className="ms" aria-hidden="true">
                logout
              </span>
              Sign out
            </button>
          </form>
        </aside>
        <main className="ws-main">{children}</main>
      </div>
    </div>
  );
}
