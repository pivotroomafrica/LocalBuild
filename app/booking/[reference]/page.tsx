import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getBookingByReference,
  getBookingIntake,
  getExpertSlugForBooking,
  isCustomerProfileCompleteForBooking,
  isHoldExpired,
} from "@/lib/booking/data";
import { getPublicExpertProfile } from "@/lib/public/data";
import { BookingJourney } from "@/components/booking/BookingJourney";
import { FormMessage } from "@/components/ui/FormMessage";

/**
 * The booking journey for one specific hold -- ownership enforced by RLS
 * (bookings_select_own, 033) so a reference belonging to another customer
 * resolves to notFound() here, never a 403 that would confirm the
 * reference exists (spec section 60). Not in middleware.ts's
 * PROTECTED_PREFIXES (booking selection itself is public, spec section
 * 26), so this page enforces auth itself, same pattern as
 * requireApprovedExpertPage in lib/availability/data.ts.
 */
export default async function BookingReferencePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/booking/${reference}`)}`);

  const booking = await getBookingByReference(supabase, reference);
  if (!booking) notFound();

  if (isHoldExpired(booking)) {
    const expertSlug = await getExpertSlugForBooking(supabase, booking.id);
    const resumeHref = expertSlug
      ? `/book/${expertSlug}?duration=${booking.duration_minutes}&format=${booking.session_format}`
      : "/experts";

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
          <p className="text-sm text-[var(--color-text)]">Your reserved time expired.</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose an available time to continue.
          </p>
          <Link
            href={resumeHref}
            className="mx-auto inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
          >
            Choose Another Time
          </Link>
        </div>
      </div>
    );
  }

  if (booking.booking_status === "awaiting_payment") {
    redirect(`/booking/${reference}/payment`);
  }

  if (booking.booking_status !== "held") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <FormMessage variant="error">This booking is no longer active.</FormMessage>
      </div>
    );
  }

  const [intake, profileComplete, expertSlug, { data: customerProfile }, { data: industries }] =
    await Promise.all([
      getBookingIntake(supabase, booking.id),
      isCustomerProfileCompleteForBooking(supabase, user.id),
      getExpertSlugForBooking(supabase, booking.id),
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("industries").select("*").eq("is_active", true).order("name"),
    ]);

  const expertProfile = expertSlug ? await getPublicExpertProfile(supabase, expertSlug) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-xl font-semibold text-[var(--color-text)]">Time Reserved</h1>
      <BookingJourney
        booking={booking}
        intake={intake}
        needsProfile={!profileComplete}
        customerProfile={customerProfile ?? null}
        industries={industries ?? []}
        expertName={expertProfile?.fullName ?? "your expert"}
      />
    </div>
  );
}
