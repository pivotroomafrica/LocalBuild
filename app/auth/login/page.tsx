import { Suspense } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { LinkedInButton, OrDivider } from "@/components/auth/LinkedInButton";
import { getOAuthProviders } from "@/lib/auth/providers";

type Props = { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const safeNextPath = typeof next === "string" && next.startsWith("/") ? next : null;
  const query = safeNextPath ? `?next=${encodeURIComponent(safeNextPath)}` : "";
  const providers = await getOAuthProviders();

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see your sessions and book again." tab="login" query={query}>
      {error === "oauth" ? (
        <p className="notice err" role="alert" style={{ marginBlockEnd: 16 }}>
          Signing in with LinkedIn didn&apos;t finish. Please try again, or use your email and password.
        </p>
      ) : null}
      {providers.linkedin ? (
        <div className="flex flex-col gap-4" style={{ marginBlockEnd: 16 }}>
          <LinkedInButton next={safeNextPath} />
          <OrDivider />
        </div>
      ) : null}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
