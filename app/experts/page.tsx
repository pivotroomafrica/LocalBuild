import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertDirectory } from "@/lib/public/data";

export const metadata = { title: "Find an Expert — Pivotroom" };

export default async function ExpertDirectoryPage() {
  const supabase = await createClient();
  const experts = await getPublicExpertDirectory(supabase);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)]">Find an Expert</h1>
        <p className="mt-2 text-base text-[var(--color-text-muted)]">
          Book a one-to-one consultation with an experienced professional.
        </p>
      </div>

      {experts.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No experts are published yet. Check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {experts.map((expert) => (
            <Link
              key={expert.slug}
              href={`/experts/${expert.slug}`}
              className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-brand)]"
            >
              <div className="flex items-center gap-3">
                {expert.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={expert.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-bg)] text-lg font-semibold text-[var(--color-text-muted)]">
                    {expert.fullName.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{expert.fullName}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {[expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ")}
                  </p>
                </div>
              </div>

              {expert.headline ? (
                <p className="line-clamp-2 text-sm text-[var(--color-text-muted)]">{expert.headline}</p>
              ) : null}

              {expert.categoryNames.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {expert.categoryNames.map((name) => (
                    <li
                      key={name}
                      className="rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-[11px] text-[var(--color-text)]"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-auto flex items-center justify-between pt-2 text-sm">
                <span className="font-medium text-[var(--color-text)]">
                  {expert.startingPrice != null ? `From ${Number(expert.startingPrice).toLocaleString()} ETB` : ""}
                </span>
                <span className="font-medium text-[var(--color-brand)]">View Profile &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
