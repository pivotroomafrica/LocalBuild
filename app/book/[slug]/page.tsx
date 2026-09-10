import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertProfile } from "@/lib/public/data";
import { BookingPicker } from "@/components/booking/BookingPicker";

/**
 * Public booking entry point (spec section 8) -- reachable without
 * logging in (not in middleware.ts's PROTECTED_PREFIXES). Selection state
 * (duration/format/start) lives entirely in the query string so it
 * survives the auth round-trip unchanged (spec section 27): only the
 * actual "Reserve This Time" submission is protected, by
 * create_booking_hold() requiring auth.uid() internally.
 */
export default async function BookExpertPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  // Same published-only public data layer as /experts/[slug] -- a
  // draft/submitted/rejected/unpublished/suspended slug resolves to null
  // here identically to one that never existed.
  const profile = await getPublicExpertProfile(supabase, slug);
  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rawDuration = typeof sp.duration === "string" ? Number(sp.duration) : null;
  const initialDuration = rawDuration && Number.isFinite(rawDuration) ? rawDuration : null;
  const initialFormat = typeof sp.format === "string" ? sp.format : null;
  const initialStart = typeof sp.start === "string" ? sp.start : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <BookingPicker
        expertSlug={slug}
        expertName={profile.fullName}
        sessionOfferings={profile.sessionOfferings}
        onlineEnabled={profile.onlineEnabled}
        inPersonEnabled={profile.inPersonEnabled}
        isLoggedIn={Boolean(user)}
        initialDuration={initialDuration}
        initialFormat={initialFormat}
        initialStart={initialStart}
      />
    </div>
  );
}
