import { redirect, notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ApplicationStatus, ExpertProfileStatus } from "@/types/expert";

type TypedClient = SupabaseClient<Database>;

export type AdminIdentity = {
  id: string;
  full_name: string;
};

/**
 * Server-side authorization layer for /admin/* pages -- layer 2 of the 3
 * required by the Phase 3 spec (UI/router is layer 1, via proxy.ts;
 * database RLS/triggers via is_admin() is layer 3). Every admin page
 * calls this before rendering anything.
 *
 * Not logged in -> redirect to login (same as every other protected
 * route). Logged in but not an admin -> notFound(), the same response a
 * customer gets for any URL that doesn't exist for them: it does not
 * confirm or deny that an admin area exists at this path, matching the
 * "unpublished slug returns bare 404" info-leak posture used for public
 * expert profiles.
 */
export async function requireAdminPage(supabase: TypedClient): Promise<AdminIdentity> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") notFound();

  return { id: profile.id, full_name: profile.full_name };
}

export type AdminActionAuthResult =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; error: string };

/**
 * Same authorization check as requireAdminPage, but for Server Actions
 * (lib/admin/actions.ts), which need to return a controlled
 * { error } result rather than redirect/notFound -- a review action
 * called by a non-admin (however that request was crafted) gets a plain
 * "Not authorized." string, never a stack trace or a silent no-op.
 */
export async function requireAdminForAction(supabase: TypedClient): Promise<AdminActionAuthResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be logged in to do that." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Not authorized." };
  }

  return { ok: true, admin: { id: profile.id, full_name: profile.full_name } };
}

export type AdminExpertTab =
  | "submitted"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "suspended";

export const ADMIN_EXPERT_TABS: { tab: AdminExpertTab; label: string }[] = [
  { tab: "submitted", label: "Submitted" },
  { tab: "changes_requested", label: "Changes Requested" },
  { tab: "approved", label: "Approved" },
  { tab: "published", label: "Published" },
  { tab: "rejected", label: "Rejected" },
  { tab: "suspended", label: "Suspended" },
];

export type AdminExpertListRow = {
  id: string;
  slug: string;
  headline: string | null;
  current_position: string | null;
  current_company: string | null;
  application_status: ApplicationStatus;
  profile_status: ExpertProfileStatus;
  submitted_at: string | null;
  full_name: string;
};

/**
 * Admin list, scoped to one lifecycle tab at a time (spec section 10:
 * "filters/tabs for actual lifecycle states ... no fake counts, no
 * complex filtering"). A tab is not a single column value -- "Approved"
 * specifically means approved-but-not-yet-published (application_status
 * = approved AND profile_status = ready), distinct from "Published"
 * (profile_status = published, application_status stays approved) -- see
 * the state machine in 013_admin_authorization.sql /
 * 014_expert_review_trigger_fix.sql.
 *
 * `search` is a plain client-side substring match over the handful of
 * fields already fetched (name/headline/company) -- intentionally not a
 * database query feature, per "simple search ... no complex filtering."
 */
export async function getAdminExpertList(
  supabase: TypedClient,
  tab: AdminExpertTab,
  search?: string,
): Promise<AdminExpertListRow[]> {
  // expert_profiles now has FOUR foreign keys into profiles (user_id, plus
  // approved_by/published_by/reviewed_by from 012_expert_review_fields.sql
  // / 013_admin_authorization.sql) -- the embed must be hinted with the
  // specific constraint name or PostgREST cannot pick one.
  let query = supabase
    .from("expert_profiles")
    .select(
      "id, slug, headline, current_position, current_company, application_status, profile_status, submitted_at, profiles!expert_profiles_user_id_fkey(full_name)",
    );

  if (tab === "submitted") {
    query = query.eq("application_status", "submitted");
  } else if (tab === "changes_requested") {
    query = query.eq("application_status", "changes_requested");
  } else if (tab === "approved") {
    query = query.eq("application_status", "approved").eq("profile_status", "ready");
  } else if (tab === "published") {
    query = query.eq("profile_status", "published");
  } else if (tab === "rejected") {
    query = query.eq("application_status", "rejected");
  } else if (tab === "suspended") {
    query = query.eq("profile_status", "suspended");
  }

  const { data, error } = await query.order("submitted_at", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("getAdminExpertList: failed to load expert_profiles", error);
    return [];
  }

  const rows: AdminExpertListRow[] = (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    headline: row.headline,
    current_position: row.current_position,
    current_company: row.current_company,
    application_status: row.application_status as ApplicationStatus,
    profile_status: row.profile_status as ExpertProfileStatus,
    submitted_at: row.submitted_at,
    full_name: (row.profiles as { full_name: string } | null)?.full_name ?? "Unknown",
  }));

  const term = search?.trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) =>
    [row.full_name, row.headline, row.current_company]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term)),
  );
}

export type AdminExpertDetail = {
  id: string;
  full_name: string;
};

/** Identity info for the admin detail page header -- just the applicant's
 * name. Deliberately not fetching phone/email here: the current expert
 * application doesn't collect either, and admin review doesn't need more
 * than a name to identify who is being reviewed (spec: don't overbuild). */
export async function getApplicantIdentity(
  supabase: TypedClient,
  userId: string,
): Promise<AdminExpertDetail | null> {
  const { data } = await supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle();
  return data;
}
