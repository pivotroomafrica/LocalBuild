import Link from "next/link";
import {
  CONTACT_EMAIL,
  LEGAL_DOCS,
  LEGAL_EFFECTIVE,
  LEGAL_LAST_UPDATED,
  LEGAL_REVIEWED,
  legalDoc,
  type LegalDocKey,
} from "@/lib/legal/content";

/** Terms, privacy and expert terms (website design: document tabs, a
 * contents list, "the short version", numbered sections). */
export function LegalPage({ docKey }: { docKey: LegalDocKey }) {
  const doc = legalDoc(docKey);
  const sections = doc.sections.map((section, index) => ({
    ...section,
    n: index + 1,
    anchor: section.id ?? `s${index + 1}`,
  }));

  const toc = (
    <nav className="toc" aria-label="On this page">
      {sections.map((section) => (
        <a key={section.anchor} href={`#${section.anchor}`}>
          {section.n}. {section.title}
        </a>
      ))}
    </nav>
  );

  return (
    <>
      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap stack" style={{ maxWidth: 1280, paddingBlock: "clamp(40px, 6vw, 72px)", gap: 20 }}>
          <nav className="doctabs" aria-label="Legal documents">
            {LEGAL_DOCS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={item.key === docKey ? "dt on" : "dt"}
                aria-current={item.key === docKey ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <h1 className="h1">{doc.title}</h1>
          <p className="lede">{doc.intro}</p>
          <span className="muted" style={{ fontSize: 14 }}>
            Last updated {LEGAL_LAST_UPDATED} · Effective {LEGAL_EFFECTIVE}
          </span>
          {!LEGAL_REVIEWED ? (
            <p role="note" className="notice" style={{ margin: 0, maxWidth: "72ch", background: "#fffbeb", color: "#92400e" }}>
              Draft under legal review. This text is not final and may change before Pivotroom launches.
            </p>
          ) : null}
        </div>
      </section>
      <section style={{ background: "#ffffff" }}>
        <div className="wrap legal" style={{ maxWidth: 1280, paddingBlock: "clamp(40px, 6vw, 72px) 120px" }}>
          <aside className="toc-wrap">
            <div className="tocd">
              <span className="muted" style={{ fontSize: 13, fontWeight: 500, paddingInline: 12 }}>
                On this page
              </span>
              {toc}
            </div>
            <details className="tocm">
              <summary>
                On this page{" "}
                <span className="ms" aria-hidden="true" style={{ fontSize: 22 }}>
                  arrow_drop_down
                </span>
              </summary>
              {toc}
            </details>
          </aside>
          <article className="legal-body">
            <div className="shortv">
              <span className="d" style={{ fontSize: 20 }}>
                The short version
              </span>
              <ul>
                {doc.short.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <span className="muted" style={{ fontSize: 14 }}>
                This summary helps you read the document. It does not replace it.
              </span>
            </div>
            {sections.map((section) => (
              <section key={section.anchor} id={section.anchor}>
                <h2 className="d">
                  {section.n}. {section.title}
                </h2>
                {section.paras.map((para) => (
                  <p key={para}>{para}</p>
                ))}
              </section>
            ))}
            <p className="muted">
              Questions about this document? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
