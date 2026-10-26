"use client";

import { useRef } from "react";
import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertCard } from "@/components/site/ExpertCard";

const STEPS = [
  {
    n: "001",
    img: "/images/how-1.svg",
    title: "Find your expert",
    body: "Search or pick a topic. Every profile shows what they have actually done, and every price is on the card.",
  },
  {
    n: "002",
    img: "/images/how-2.svg",
    title: "Pick a time",
    body: "Choose a session length and one of their open times, then tell them in a few lines what you want to solve.",
  },
  {
    n: "003",
    img: "/images/how-3.svg",
    title: "Pay up front",
    body: "Pay with Chapa: telebirr, CBE Birr or a card. The expert is paid only after the session takes place.",
  },
  {
    n: "004",
    img: "/images/how-4.svg",
    title: "Meet",
    body: "On Google Meet or in person, your choice. Move it free up to 24 hours before.",
  },
];

/** Founder-type roles, read from the expert's own current position. */
const FOUNDER_PATTERN = /\b(co-?founder|founder|owner|ceo|managing director)\b/i;

function isFounder(expert: PublicDirectoryCard): boolean {
  return FOUNDER_PATTERN.test(`${expert.currentPosition ?? ""} ${expert.headline ?? ""}`);
}

type ShelfProps = {
  id: string;
  eyebrow: string;
  title: string;
  sub: string;
  link: { href: string; label: string };
  experts: PublicDirectoryCard[];
};

function Shelf({ id, eyebrow, title, sub, link, experts }: ShelfProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  function slide(direction: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    const rtl = getComputedStyle(row).direction === "rtl" ? -1 : 1;
    row.scrollBy({ left: direction * rtl * row.clientWidth * 0.8 });
  }

  return (
    <div className="shelf">
      <div className="wrap shelf-head">
        <div className="txt">
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
          <p>{sub}</p>
        </div>
        <div className="nav">
          <Link href={link.href} className="link-arrow" style={{ marginInlineEnd: 12 }}>
            {link.label}{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
          {experts.length > 2 ? (
            <>
              <button type="button" className="rbtn hide-sm" aria-label="Previous" onClick={() => slide(-1)}>
                <span className="ms flip" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
              <button type="button" className="rbtn hide-sm" aria-label="Next" onClick={() => slide(1)}>
                <span className="ms" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="hscroll" ref={rowRef} role="list" aria-labelledby={id}>
        {experts.map((expert) => (
          <div role="listitem" key={expert.slug} style={{ display: "contents" }}>
            <ExpertCard expert={expert} />
          </div>
        ))}
      </div>
    </div>
  );
}

function QuoteAndWhy() {
  return (
    <>
      <figure className="wrap qgrid">
        <div className="qphoto">
          {/* eslint-disable-next-line @next/next/no-img-element -- static image, used with permission. */}
          <img src="/images/ermyas-amelga.webp" alt="Ermyas Amelga speaking on Meri Podcast" loading="lazy" />
        </div>
        <div className="qtext">
          <blockquote>
            <p lang="am" className="am">
              “እዚህ ሀገር የሚገጥሙን ነገሮች ቢዝነስ ቡክ ውስጥ የሉም።”
            </p>
            <p className="en">“The things we face in this country aren’t found in any business book.”</p>
          </blockquote>
          <figcaption className="stack" style={{ gap: 2 }}>
            <span className="d" style={{ fontSize: 20, lineHeight: 1.2 }}>
              Ermyas Amelga
            </span>
            <span className="muted" style={{ fontSize: 15 }}>
              On Meri Podcast
            </span>
          </figcaption>
        </div>
      </figure>
      <div className="wrap" style={{ paddingBlockStart: 24 }}>
        <div className="gapbox light">
          <div className="stack" style={{ gap: 14 }}>
            <span className="gaplbl">Our answer</span>
            <h3>
              He is right. <span style={{ color: "#2b4fe0" }}>That is why Pivotroom exists.</span>
            </h3>
          </div>
          <div className="stack" style={{ gap: 24, minWidth: 0 }}>
            <p>
              The answers to Ethiopian business problems are not in a book. They are in the heads of people who have
              already faced them here: the banker who has financed hundreds of export contracts, the founder who got
              through customs, forex and licensing and still made a profit. We find those people, check what they
              have actually done, and put an hour of their time within your reach.
            </p>
            <Link href="/experts" className="btn btn-ink lg" style={{ alignSelf: "flex-start", paddingInline: "24px 20px" }}>
              <span className="gl">Find someone who has been there</span>
              <span className="gs">Find an expert</span>{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

/** Topic shortcuts into the directory, from the real category list. */
function TopicsSection({ categories }: { categories: string[] }) {
  if (categories.length === 0) return null;
  return (
    <section id="topics" style={{ background: "#ffffff" }}>
      <div className="wrap section stack" style={{ gap: 32 }}>
        <div className="stack" style={{ gap: 16 }}>
          <h2 className="h2">Start from a topic</h2>
          <p className="muted" style={{ margin: 0, maxWidth: "52ch" }}>
            Pick what you need help with and see the experts who work on it.
          </p>
        </div>
        <div className="topics">
          {categories.map((topic) => (
            <Link key={topic} href={`/experts?category=${encodeURIComponent(topic)}`} className="topic">
              {topic}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Home (website design). Every expert shown is a real published profile,
 * ordered by real activity (049c). The founders/professionals shelves are
 * split by the expert's own stated role. Shelves with nobody in them are
 * left out rather than padded.
 */
export function HomeClient({ experts, categories }: { experts: PublicDirectoryCard[]; categories: string[] }) {
  const anyTop = experts.some((expert) => expert.stats.isTopExpert);
  const founders = experts.filter(isFounder);
  const professionals = experts.filter((expert) => !isFounder(expert));

  return (
    <>
      <section className="hero2" aria-labelledby="hero-title">
        <div className="hp">
          <div className="hp-top">
            <span className="hp-meta">
              Vetted founders, executives
              <br className="hide-sm" /> and professionals
            </span>
          </div>
          <div className="hp-main">
            <h1 id="hero-title" className="d hp-h">
              One hour with someone
              <br className="hide-sm" /> who has already done it.
              <br />
              <span className="hp-acc">Book them today.</span>{" "}
              <Link className="hp-cta" href="/experts">
                Find an expert{" "}
                <span className="hp-ci" aria-hidden="true">
                  <span className="ms" style={{ fontSize: 16 }}>
                    arrow_outward
                  </span>
                </span>
              </Link>
            </h1>
            <p className="hp-sub">
              Find the person who has already solved what you&apos;re facing, and book a paid one-to-one session.
            </p>
          </div>
          <div className="hp-bot">
            <Link href="/experts" className="hp-link">
              Browse all experts{" "}
              <span className="ms af" aria-hidden="true" style={{ fontSize: 16 }}>
                arrow_forward
              </span>
            </Link>
          </div>
        </div>
      </section>

      {experts.length > 0 ? (
        <section style={{ background: "#ffffff" }}>
          <div className="shelves">
            <Shelf
              id="shelf-top"
              eyebrow={anyTop ? "Top experts" : "Our experts"}
              title="The people worth an hour of your time."
              sub="Ranked by sessions completed and by what clients said afterwards. Every one vetted by our team. Every price on the card before you click."
              link={{ href: "/experts", label: "See all experts" }}
              experts={experts.slice(0, 12)}
            />
          </div>
        </section>
      ) : (
        <section style={{ background: "#ffffff" }}>
          <div className="wrap section stack" style={{ gap: 12, alignItems: "flex-start" }}>
            <span className="eyebrow">Our experts</span>
            <h2 className="h2">We&apos;re adding people now.</h2>
            <p className="lede">The first vetted experts are being onboarded. Check back soon.</p>
          </div>
        </section>
      )}

      <section id="how" style={{ background: "#f4f5f7" }}>
        <div className="wrap section stack" style={{ gap: "clamp(40px, 5vw, 64px)" }}>
          <h2 className="h2">How a session works</h2>
          <ol className="hw-grid">
            {STEPS.map((step) => (
              <li key={step.n} className="hw-col">
                <span className="hw-n num">{step.n}</span>
                <div className="hw-ic">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static line illustration. */}
                  <img src={step.img} alt="" width={120} height={96} />
                </div>
                <h3 className="d">{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="shelves tail">
          {founders.length > 0 ? (
            <div className="stack">
              <Shelf
                id="shelf-founders"
                eyebrow="Founders"
                title="Founders who have already made the mistake & plan you are about to make."
                sub="They built companies here, with Ethiopian banks, suppliers, customers and regulators. One hour with them can save you a year and a great deal of money."
                link={{ href: "/experts", label: "See all experts" }}
                experts={founders}
              />
              <QuoteAndWhy />
            </div>
          ) : (
            <div className="stack">
              <QuoteAndWhy />
            </div>
          )}
          {professionals.length > 0 ? (
            <Shelf
              id="shelf-pros"
              eyebrow="Professionals"
              title="Bankers, lawyers and marketers with the answer Google and AI can only guess at."
              sub="Specialists who do this work every day. Bring one specific question. Leave with a straight answer and the next step."
              link={{ href: "/experts", label: "See all experts" }}
              experts={professionals}
            />
          ) : null}
        </div>
      </section>

      <TopicsSection categories={categories} />
    </>
  );
}
