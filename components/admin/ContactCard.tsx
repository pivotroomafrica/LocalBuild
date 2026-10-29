import Link from "next/link";
import type { AdminPerson } from "@/lib/admin/people";

/** Who someone is and how to reach them, for admin pages. */
export function ContactCard({ title, person }: { title: string; person: AdminPerson | null }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-text-muted)]">{title}</p>
      {person ? (
        <>
          <Link
            href={`/admin/people/${person.user_id}`}
            className="mt-1 block text-[17px] font-bold text-[var(--color-text)] hover:underline"
          >
            {person.full_name}
          </Link>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <ContactLine icon="call" label="Phone">
              {person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : "Not given"}
            </ContactLine>
            <ContactLine icon="mail" label="Email">
              <a href={`mailto:${person.email}`} className="break-all">
                {person.email}
              </a>
            </ContactLine>
            <ContactLine icon="location_on" label="Location">
              {[person.city, person.country].filter(Boolean).join(", ") || "Not given"}
            </ContactLine>
          </dl>
          <Link
            href={`/admin/people/${person.user_id}`}
            className="mt-3 inline-block text-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            Full details and sessions
          </Link>
        </>
      ) : (
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Account not found.</p>
      )}
    </section>
  );
}

function ContactLine({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="ms text-[18px] text-[var(--color-text-muted)]" aria-hidden="true">
        {icon}
      </span>
      <dt className="sr-only">{label}</dt>
      <dd className="m-0 min-w-0 text-[var(--color-text)] [&_a]:text-[var(--color-accent)] [&_a:hover]:underline">
        {children}
      </dd>
    </div>
  );
}
