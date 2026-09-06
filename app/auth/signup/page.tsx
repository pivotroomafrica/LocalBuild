import { AuthShell } from "@/components/layout/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Book time with people who've been there.">
      <SignupForm />
    </AuthShell>
  );
}
