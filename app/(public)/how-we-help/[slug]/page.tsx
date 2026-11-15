import Link from "next/link";
import { notFound } from "next/navigation";
import { HOW_PAGES, getHowPage } from "@/lib/site/howWeHelp";

export function generateStaticParams() {
  return HOW_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/how-we-help/[slug]">) {
  const page = getHowPage((await params).slug);
  return page ? { title: `${page.title} — Pivotroom`, description: page.lead } : {};
}

/** One "How we help" page: intro, facts, what you get, steps, questions. */
export default async function HowWeHelpDetailPage({ params }: PageProps<"/how-we-help/[slug]">) {
  const page = getHowPage((await params).slug);
  if (!page) notFound();
  const others = HOW_PAGES.filter((other) => other.slug !== page.slug);

  return (
    <>
      <section className="hw-hero">
        <div className="wrap hw-hero-grid">
          <div className="stack" style={{ gap: 18 }}>
            <Link href="/how-we-help" className="hw-back">
              <span className="ms" aria-hidden="true">
                chevron_left
              </span>
              How we help
            </Link>
            <h1 className="hw-h1">{page.title}</h1>
            <p className="hw-lead">{page.lead}</p>
            <div>
              <Link href={page.cta.href} className="btn btn-ink lg">
                {page.cta.label}{" "}
                <span className="ms af" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
          <div className="hw-hero-art" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
            <img src={page.image} alt="" />
          </div>
        </div>
        <div className="wrap">
          <dl className="hw-facts">
            {page.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="num">{fact.value}</dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="wrap section stack" style={{ gap: 32 }}>
          <h2 className="h2">What you get</h2>
          <ul className="hw-points">
            {page.points.map((point) => (
              <li key={point.title}>
                <span className="ms" aria-hidden="true">
                  {point.icon}
                </span>
                <span className="d" style={{ fontSize: 19 }}>
                  {point.title}
                </span>
                <span className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>
                  {point.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap section split">
          <h2 className="h2">How it works</h2>
          <ol className="steplist">
            {page.steps.map((step, index) => (
              <li key={step.title}>
                <span className="muted num" style={{ fontSize: 14, fontWeight: 500 }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="d" style={{ fontSize: 19 }}>
                    {step.title}
                  </span>
                  <span className="muted" style={{ fontSize: 15 }}>
                    {step.body}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="wrap section stack" style={{ maxWidth: 880, gap: 24 }}>
          <h2 className="h2">Questions</h2>
          <div className="faqs">
            {page.faqs.map((faq) => (
              <details key={faq.q} className="faq">
                <summary>
                  {faq.q}
                  <span className="ms chev" aria-hidden="true">
                    arrow_drop_down
                  </span>
                </summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
          <Link href="/help" className="link-arrow">
            More answers in Help and FAQ{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </section>

      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap section stack" style={{ gap: 24 }}>
          <h2 className="h2">More ways we help</h2>
          <div className="hw-more">
            {others.map((other) => (
              <Link key={other.slug} href={`/how-we-help/${other.slug}`}>
                <span>{other.title}</span>
                <span className="nav-arrowbox" aria-hidden="true">
                  <span className="ms">arrow_forward</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
