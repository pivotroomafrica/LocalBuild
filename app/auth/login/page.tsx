import { Suspense } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const query = typeof next === "string" && next.startsWith("/") ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see your sessions and book again." tab="login" query={query}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
