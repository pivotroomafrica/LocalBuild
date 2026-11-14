import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { CompleteProfileForm } from "@/components/auth/CompleteProfileForm";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/home";

export const metadata = { title: "Finish your profile — Pivotroom" };

/** Shown once after a first "Continue with LinkedIn" (see /auth/callback). */
export default async function CompleteProfilePage({ searchParams }: PageProps<"/auth/complete-profile">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null) ?? "/dashboard";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, country, city")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AuthShell
      title="Finish your profile"
      subtitle="LinkedIn shared your name and email. Add your phone and where you're based so experts can reach you about your sessions."
    >
      <CompleteProfileForm
        fullName={profile?.full_name ?? ""}
        phone={profile?.phone ?? null}
        country={profile?.country ?? null}
        city={profile?.city ?? null}
        next={next}
      />
    </AuthShell>
  );
}
