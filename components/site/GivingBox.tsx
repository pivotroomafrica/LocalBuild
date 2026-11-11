import type { ExpertGiving } from "@/lib/public/data";

/** "Part of [name]'s earnings go to [NGO]" box above About. The
 * percentage is never shown to clients. */
export function GivingBox({ giving, firstName }: { giving: ExpertGiving; firstName: string }) {
  return (
    <section className="giving-box" aria-label="Giving back">
      <span className="giving-icon" aria-hidden="true">
        <span className="ms">volunteer_activism</span>
      </span>
      <p>
        Part of {firstName}&apos;s earnings from Pivotroom sessions go to <strong>{giving.ngoName}</strong>
      </p>
    </section>
  );
}
