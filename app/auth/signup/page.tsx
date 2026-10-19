import { Suspense } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const query = typeof next === "string" && next.startsWith("/") ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <AuthShell title="Create your account" subtitle="Book an hour with someone who has done it." tab="signup" query={query}>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
