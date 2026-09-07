import { redirect } from "next/navigation";

// /admin has nothing of its own to show -- the expert review queue is the
// only thing admin does in Phase 3 (no fake stats dashboard).
export default function AdminIndexPage() {
  redirect("/admin/experts");
}
