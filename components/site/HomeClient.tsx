"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertCard } from "@/components/site/ExpertCard";

const STEPS = [
  {
    n: "01",
    icon: "edit_note",
    title: "Describe your problem",
    body: "A few lines on what you are working on. No account needed to see your matches.",
  },
  {
    n: "02",
    icon: "person",
    title: "Pick your expert",
    body: "Read their background, see their price and duration, and choose a time that suits you both.",
  },
  {
    n: "03",
    icon: "payments",
    title: "Pay up front",
    body: "Pay through Chapa with telebirr, CBE Birr or a bank card. The expert is paid only after the session takes place.",
  },
  {
    n: "04",
    icon: "videocam",
    title: "Meet",
    body: "On Google Meet or in person, your choice. Your full session, undivided.",
  },
];

/** What the matcher returns, shown beside the example brief. Describes the
 * feature instead of showing invented people. */
const MATCH_OUTPUT = [
  { icon: "groups", title: "The experts best placed to help", why: "Read against each expert's actual experience" },
  { icon: "lightbulb", title: "The reason for each one", why: "Why their background fits your situation" },
  { icon: "payments", title: "Their price before you click", why: "VAT included, no fee until you book" },
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
        <div className="gapbox">
          <h3>He is right. That is why Pivotroom exists.</h3>
          <div className="stack" style={{ gap: 24, minWidth: 0 }}>
            <p>
              The answers to Ethiopian business problems are not in a book. They are in the heads of people who have
              already faced them here: the banker who has financed hundreds of export contracts, the founder who got
              through customs, forex and licensing and still made a profit. We find those people, check what they
              have actually done, and put an hour of their time within your reach.
            </p>
            <a href="#match" className="btn btn-white md" style={{ alignSelf: "flex-start" }}>
              <span className="gl">Find someone who has been there</span>
              <span className="gs">Find my match</span>{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function MatchSection({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  function toggle(topic: string) {
    setPicked((current) => (current.includes(topic) ? current.filter((t) => t !== topic) : [...current, topic]));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = brief.trim();
    const topicLine = picked.length > 0 ? `I need help with: ${picked.join(", ")}.` : "";
    const problem = [text, topicLine].filter(Boolean).join(" ");
    if (!problem) {
      document.getElementById("brief")?.focus();
      return;
    }
    router.push(`/match?problem=${encodeURIComponent(problem)}`);
  }

  return (
    <section id="match" style={{ background: "#ffffff" }}>
      <div className="wrap section stack" style={{ gap: 40 }}>
        <div className="stack" style={{ gap: 16 }}>
          <h2 className="h2">
            Start with what
            <br />
            you&apos;re facing
          </h2>
          <p className="muted" style={{ margin: 0, maxWidth: "52ch" }}>
            Describe it in a few lines and we&apos;ll match you with the people who have already solved it. Or start
            from a topic.
          </p>
        </div>
        <div className="matchgrid">
          <div className="matchcol">
            <form className="brief" onSubmit={submit}>
              <label htmlFor="brief" className="sr">
                What are you working on?
              </label>
              <textarea
                id="brief"
                rows={4}
                maxLength={1000}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="Describe your problem or your plan in a few lines. We read it against each expert's actual experience and show you the people best placed to help, with the reason for each."
              />
              <div className="row">
                <span>Matched in minutes · No fee until you book</span>
                <button type="submit" className="btn btn-ink md">
                  Find my match{" "}
                  <span className="ms af" aria-hidden="true">
                    arrow_forward
                  </span>
                </button>
              </div>
            </form>
            {categories.length > 0 ? (
              <div className="stack" style={{ gap: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <span className="eyebrow">Or pick the topics you need</span>
                  <span className="muted num" style={{ fontSize: 14 }}>
                    {picked.length > 0 ? `${picked.length} selected` : ""}
                  </span>
                </div>
                <div className="topics" role="group" aria-label="Topics">
                  {categories.map((topic) => {
                    const on = picked.includes(topic);
                    return (
                      <button
                        key={topic}
                        type="button"
                        className={on ? "topic on" : "topic"}
                        aria-pressed={on}
                        onClick={() => toggle(topic)}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <figure className="exbox">
            <figcaption>
              <span className="ms" aria-hidden="true">
                chat_bubble
              </span>
              Example brief
            </figcaption>
            <p className="q">
              &ldquo;We run a 40-seat restaurant in Bole and want to open a second branch. Should we take a bank loan
              or bring in a partner?&rdquo;
            </p>
            <span className="muted" style={{ marginBlockStart: "auto", fontSize: 14 }}>
              What you get back
            </span>
            <div className="stack" style={{ gap: 8 }}>
              {MATCH_OUTPUT.map((row) => (
                <div key={row.title} className="exrow">
                  <span className="av" aria-hidden="true">
                    <span className="ms" style={{ fontSize: 20 }}>
                      {row.icon}
                    </span>
                  </span>
                  <span className="tx">
                    <span className="n">{row.title}</span>
                    <span className="w">{row.why}</span>
                  </span>
                </div>
              ))}
            </div>
          </figure>
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
      <section className="hero ink">
        <div className="in">
          <span style={{ fontSize: 14, color: "#9ba1aa" }}>Vetted founders, executives and professionals</span>
          <h1>One hour with someone who has done it.</h1>
          <p>
            Tell us what you&apos;re facing. We&apos;ll match you with the person who has already solved it, and you
            book a paid one-to-one session.
          </p>
          <div className="ctas">
            <a href="#match" className="btn btn-white lg">
              Find my match{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </a>
            <Link href="/experts" className="lk link-arrow" style={{ fontWeight: 400 }}>
              Browse all experts{" "}
              <span className="ms af" aria-hidden="true">
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
        <div className="wrap section stack" style={{ gap: 40 }}>
          <h2 className="h2">How a session works</h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.n}>
                <div className="top">
                  <span className="ms" aria-hidden="true">
                    {step.icon}
                  </span>
                  <span className="eyebrow num">{step.n}</span>
                </div>
                <span className="t">{step.title}</span>
                <span className="b">{step.body}</span>
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

      <MatchSection categories={categories} />
    </>
  );
}
