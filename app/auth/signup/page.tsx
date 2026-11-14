import { Suspense } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { LinkedInButton, OrDivider } from "@/components/auth/LinkedInButton";
import { getOAuthProviders } from "@/lib/auth/providers";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const safeNextPath = typeof next === "string" && next.startsWith("/") ? next : null;
  const query = safeNextPath ? `?next=${encodeURIComponent(safeNextPath)}` : "";
  const providers = await getOAuthProviders();

  return (
    <AuthShell title="Create your account" subtitle="Book an hour with someone who has done it." tab="signup" query={query}>
      {providers.linkedin ? (
        <div className="flex flex-col gap-4" style={{ marginBlockEnd: 16 }}>
          <LinkedInButton next={safeNextPath} />
          <OrDivider />
        </div>
      ) : null}
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
