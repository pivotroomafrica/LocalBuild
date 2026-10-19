import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin/data";
import { WorkspaceShell } from "@/components/app/WorkspaceShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // Layer 2 of 3 -- see the comment on requireAdminPage.
  await requireAdminPage(supabase);

  return (
    <WorkspaceShell area="admin">{children}</WorkspaceShell>
  );
}
