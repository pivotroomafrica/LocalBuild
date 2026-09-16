import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { FormMessage } from "@/components/ui/FormMessage";
import { DashboardNav } from "@/components/layout/DashboardNav";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already redirects unauthenticated visitors away from
  // /dashboard/*; this is a defense-in-depth check, not the primary guard.
  if (!user) redirect("/auth/login");

  const [{ data: profile }, { data: customerProfile }, { data: industries }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("industries").select("*").eq("is_active", true).order("name"),
    ]);

  if (!profile) {
    return (
      <div>
        <DashboardNav current="/dashboard/profile" />
        <FormMessage variant="error">
          We couldn&apos;t load your profile. Please try again.
        </FormMessage>
      </div>
    );
  }

  return (
    <div>
      <DashboardNav current="/dashboard/profile" />
      <ProfileForm
        email={user.email ?? ""}
        profile={profile}
        customerProfile={customerProfile ?? null}
        industries={industries ?? []}
      />
    </div>
  );
}
