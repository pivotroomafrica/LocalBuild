import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homePathFor, safeNext } from "@/lib/auth/home";
import { CompleteProfileForm } from "@/components/auth/CompleteProfileForm";
import { AuthShell } from "@/components/layout/AuthShell";

export const metadata = { title: "Finish your profile — Pivotroom" };

/**
 * After a first Google sign-in: phone, country, city, the name split into
 * parts, and the Terms. Anyone who already has all of it goes straight on.
 */
type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function CompleteProfilePage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, first_name, middle_name, last_name, phone, country, city, terms_accepted_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.phone && profile.country && profile.city && profile.terms_accepted_at) {
    redirect(next ?? (await homePathFor(supabase, user.id)));
  }

  // Google gives one full name; offer it split as a starting point.
  const parts = (profile?.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  const defaults = {
    first: profile?.first_name ?? parts[0] ?? "",
    middle: profile?.middle_name ?? (parts.length > 2 ? parts.slice(1, -1).join(" ") : ""),
    last: profile?.last_name ?? (parts.length > 1 ? parts[parts.length - 1] : ""),
  };

  return (
    <AuthShell
      title="Finish your profile"
      subtitle="A few details Google doesn't share with us, so experts and our team can reach you."
    >
      <CompleteProfileForm
        next={next ?? ""}
        defaults={defaults}
        phone={profile?.phone ?? ""}
        country={profile?.country ?? null}
        city={profile?.city ?? null}
      />
    </AuthShell>
  );
}
