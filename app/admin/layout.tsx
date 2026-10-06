import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin/data";
import { WorkspaceShell } from "@/components/app/WorkspaceShell";
import { AdminNav } from "@/components/layout/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // Layer 2 of 3 -- see the comment on requireAdminPage.
  await requireAdminPage(supabase);

  return (
    <WorkspaceShell width="wide" eyebrow="Admin" before={<AdminNav />}>
      {children}
    </WorkspaceShell>
  );
}
