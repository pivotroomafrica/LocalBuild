import { redirect } from "next/navigation";

/** Moved to a full-width page outside the admin shell. */
export default async function AdminExpertPreviewRedirect({ params }: PageProps<"/admin/experts/[id]/preview">) {
  const { id } = await params;
  redirect(`/preview/expert/${id}`);
}
