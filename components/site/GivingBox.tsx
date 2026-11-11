import type { ExpertGiving } from "@/lib/public/data";

/** "X% of [name]'s earnings go to [NGO]" box shown above the About section. */
export function GivingBox({ giving, firstName }: { giving: ExpertGiving; firstName: string }) {
  return (
    <section className="giving-box" aria-label="Giving back">
      <span className="giving-icon" aria-hidden="true">
        <span className="ms">volunteer_activism</span>
      </span>
      <p>
        <strong className="num">{giving.percent}%</strong> of {firstName}&apos;s earnings from Pivotroom sessions go
        to <strong>{giving.ngoName}</strong>
      </p>
    </section>
  );
}
