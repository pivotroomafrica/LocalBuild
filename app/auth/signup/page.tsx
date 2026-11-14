import { Suspense } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { getOAuthProviders } from "@/lib/auth/providers";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const safeNextPath = typeof next === "string" && next.startsWith("/") ? next : null;
  const query = safeNextPath ? `?next=${encodeURIComponent(safeNextPath)}` : "";
  const providers = await getOAuthProviders();

  return (
    <AuthShell title="Create your account" subtitle="Book an hour with someone who has done it." tab="signup" query={query}>
      <Suspense fallback={null}>
        <SignupForm linkedin={providers.linkedin} />
      </Suspense>
    </AuthShell>
  );
}
