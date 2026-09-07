import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin/data";
import { AdminHeader } from "@/components/layout/AdminHeader";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // Layer 2 of 3 -- see the comment on requireAdminPage.
  await requireAdminPage(supabase);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <AdminHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
