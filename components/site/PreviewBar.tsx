import Link from "next/link";

/** The dark bar above a profile preview: what this is, and the way back. */
export function PreviewBar({ note, backHref, backLabel }: { note: string; backHref: string; backLabel: string }) {
  return (
    <div className="pv-bar">
      <div className="wrap pv-row">
        <span className="pv-tag">Preview</span>
        <span className="pv-note">{note}</span>
        <Link href={backHref} className="btn btn-white md">
          <span className="ms flip" aria-hidden="true">
            arrow_forward
          </span>{" "}
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
