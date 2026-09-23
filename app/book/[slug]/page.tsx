import { redirect } from "next/navigation";

/**
 * Phase 12 (critical architecture change): the standalone pre-auth
 * picker is retired -- SESSION/TIME selection now happens inline in
 * BookingRail on the expert profile itself. An old bookmarked/shared
 * /book/[slug] link must not 404 (spec: "old bookmarked booking URLs
 * must not blindly 404"), so it redirects to the profile, where the
 * rail starts a fresh SESSION state. Pre-hold duration/format/start
 * query params are deliberately not carried over -- nothing server-
 * authoritative was ever created for them, so there is nothing to
 * "restore"; the customer just re-selects, same as any other fresh visit.
 */
export default async function BookExpertPageRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/experts/${slug}`);
}
