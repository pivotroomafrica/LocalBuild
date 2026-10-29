import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminPerson, getAdminPersonBookings } from "@/lib/admin/people";
import { ContactCard } from "@/components/admin/ContactCard";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/types/booking";

export default async function AdminPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const person = await getAdminPerson(supabase, id);
  if (!person) notFound();
  const bookings = await getAdminPersonBookings(supabase, person);
  const isExpert = Boolean(person.expert_profile_id);
  const linkedin = person.expert_linkedin ?? person.client_linkedin;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/people?tab=${isExpert ? "experts" : "clients"}`}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          &larr; Back to clients &amp; experts
        </Link>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">
          {person.full_name}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {person.role === "admin" ? "Admin" : isExpert ? "Expert" : "Client"} · joined{" "}
          {new Date(person.created_at).toLocaleDateString()}
          {person.last_sign_in_at ? ` · last signed in ${new Date(person.last_sign_in_at).toLocaleString()}` : ""}
          {person.account_status !== "active" ? ` · account ${person.account_status}` : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ContactCard title="Contact" person={person} />
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-text-muted)]">Background</p>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            {person.client_job_title || person.company_name ? (
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Role</dt>
                <dd className="m-0">{[person.client_job_title, person.company_name].filter(Boolean).join(" at ")}</dd>
              </div>
            ) : null}
            {linkedin ? (
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">LinkedIn</dt>
                <dd className="m-0 break-all">
                  <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
                    {linkedin}
                  </a>
                </dd>
              </div>
            ) : null}
            {isExpert ? (
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Expert profile</dt>
                <dd className="m-0 flex flex-wrap gap-3">
                  <Link href={`/admin/experts/${person.expert_profile_id}`} className="text-[var(--color-accent)] hover:underline">
                    Application ({person.application_status})
                  </Link>
                  {person.profile_status === "published" && person.expert_slug ? (
                    <Link href={`/experts/${person.expert_slug}`} className="text-[var(--color-accent)] hover:underline">
                      Public profile
                    </Link>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {!person.client_job_title && !person.company_name && !linkedin && !isExpert ? (
              <p className="m-0 text-[var(--color-text-muted)]">No professional details added yet.</p>
            ) : null}
          </dl>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]">Sessions</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No sessions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bookings.map((booking) => (
              <li key={booking.reference}>
                <Link
                  href={`/admin/bookings/${booking.reference}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm hover:border-[var(--color-border-hover)]"
                >
                  <span className="font-semibold">
                    {booking.reference}{" "}
                    <span className="font-normal text-[var(--color-text-muted)]">
                      · as {booking.side === "client" ? "client" : "expert"}
                    </span>
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {new Date(booking.startAt).toLocaleString()} ·{" "}
                    {BOOKING_STATUS_LABELS[booking.status as BookingStatus] ?? booking.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
