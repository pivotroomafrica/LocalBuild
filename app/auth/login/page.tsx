import { Suspense } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
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
          Signing in with Google or LinkedIn didn&apos;t finish. Please try again, or use your email and password.
        </p>
      ) : null}
      <Suspense fallback={null}>
        <LoginForm linkedin={providers.linkedin} />
      </Suspense>
    </AuthShell>
  );
}
