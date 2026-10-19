import Link from "next/link";
import { getCategoryNamesForRequest, getDirectoryForRequest } from "@/lib/public/cached";
import { initialsOf } from "@/components/site/format";

export const metadata = { title: "About — Pivotroom" };

const RULES = [
  { icon: "key", title: "Access", body: "You reach someone you could not have reached alone. No feeds, no endless scrolling." },
  { icon: "videocam", title: "Presence", body: "One session, one person, full attention. Nothing competes with the conversation." },
  {
    icon: "verified",
    title: "Standing",
    body: "Our experts' time has real value, and we treat it that way, from vetting to pricing.",
  },
  {
    icon: "receipt_long",
    title: "Plain dealing",
    body: "Price, length and terms are on the page before you book. No surprises afterwards.",
  },
];

const VETTING = [
  { n: "01", title: "They apply", body: "With a written application about what they have built, who they help and what they charge." },
  { n: "02", title: "We check who they are", body: "Our team reviews every application and the track record behind it before anything goes live." },
  { n: "03", title: "We test the fit", body: "Can they give a plain answer to a real problem in one session? If not, they are not listed." },
  {
    n: "04",
    title: "Clients keep them honest",
    body: "After every session the client can leave a review. Experts who stop delivering stop being shown.",
  },
];

/** People named in the website design. Add the fourth team member once
 * their role is confirmed. */
const TEAM = [
  { name: "Hailemichael Adugna", role: "Co-founder and CEO" },
  { name: "Lidiya Fitsum", role: "Co-founder and COO" },
  { name: "Mahder Weldetensay", role: "Marketing manager" },
];

/** About (website design). The "Pivotroom today" figures are live counts
 * from the published directory, never fixed marketing numbers. */
export default async function AboutPage() {
  const [experts, categories] = await Promise.all([getDirectoryForRequest(), getCategoryNamesForRequest()]);
  const sessions = experts.reduce((sum, expert) => sum + expert.stats.sessionsCompleted, 0);

  const figures = [
    { value: String(experts.length), label: experts.length === 1 ? "Vetted expert you can book today" : "Vetted experts you can book today" },
    { value: String(categories.length), label: "Topics, from raising money to exporting" },
    ...(sessions > 0
      ? [{ value: String(sessions), label: sessions === 1 ? "Session completed so far" : "Sessions completed so far" }]
      : []),
  ];

  return (
    <>
      <section className="hero ink">
        <div className="in" style={{ minHeight: "min(calc(100svh - 72px), 600px)" }}>
          <span style={{ fontSize: 14, color: "#9ba1aa" }}>About Pivotroom</span>
          <h1>Experience is the one thing you can&apos;t download.</h1>
          <p>
            So we built a place to borrow it. Pivotroom puts you in a room, for one paid session, with someone who has
            already done what you are about to try.
          </p>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="wrap section split">
          <h2 className="h2">Why we built Pivotroom</h2>
          <div className="stack" style={{ gap: 16, fontSize: 18, lineHeight: 1.65 }}>
            <p style={{ margin: 0 }}>
              In Ethiopia, the most useful business advice has never been written down. It lives in the heads of people
              who opened the second branch, signed the first export contract, won the bank loan or lost it and learned
              why.
            </p>
            <p style={{ margin: 0 }}>If you knew one of them, you could ask. Most people don&apos;t. So they guess, and guessing is expensive.</p>
            <p style={{ margin: 0 }}>
              Pivotroom changes who gets to ask. Tell us what you are facing. We match you with the people whose
              experience fits, show you their price up front, and you meet them on Google Meet or in person.
            </p>
            <p style={{ margin: 0 }}>The expert is paid for their time. You leave with an answer, not a reading list.</p>
          </div>
        </div>
      </section>

      {experts.length > 0 ? (
        <section style={{ background: "#ffffff" }}>
          <div className="wrap stack" style={{ paddingBlockEnd: "clamp(80px, 9vw, 128px)", gap: 40 }}>
            <h2 className="h2">Pivotroom today</h2>
            <div className="nums">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <span className="d num">{figure.value}</span>
                  <span className="muted">{figure.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap section stack" style={{ gap: 40 }}>
          <div className="stack" style={{ gap: 12 }}>
            <h2 className="h2">Four rules we don&apos;t bend</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "56ch" }}>
              Every decision on Pivotroom, from the way a profile looks to the way money moves, is tested against these.
            </p>
          </div>
          <ul className="lookfor">
            {RULES.map((rule) => (
              <li key={rule.title} style={{ background: "#ffffff" }}>
                <span className="ms" aria-hidden="true" style={{ fontSize: 22 }}>
                  {rule.icon}
                </span>
                <span className="d" style={{ fontSize: 20 }}>
                  {rule.title}
                </span>
                <span className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>
                  {rule.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="ink" style={{ background: "#0d0f12", color: "#ffffff" }}>
        <div className="wrap section split">
          <div className="stack" style={{ gap: 16 }}>
            <h2 className="h2">How someone becomes a Pivotroom expert</h2>
            <p style={{ margin: 0, color: "#9ba1aa", maxWidth: "44ch" }}>
              Not everyone who applies is listed. Every expert passes the same checks, however well known they are.
            </p>
          </div>
          <ol className="steplist">
            {VETTING.map((step) => (
              <li key={step.n} style={{ borderColor: "#262a31" }}>
                <span className="num" style={{ fontSize: 14, fontWeight: 500, color: "#9ba1aa" }}>
                  {step.n}
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <span className="d" style={{ fontSize: 19 }}>
                    {step.title}
                  </span>
                  <span style={{ fontSize: 15, color: "#9ba1aa" }}>{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="wrap section stack" style={{ gap: 40 }}>
          <div className="stack" style={{ gap: 12 }}>
            <h2 className="h2">The people behind it</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
              A small team that has spent years getting the right people into the same room. We built Pivotroom so that
              conversation can happen for anyone, not only the well connected.
            </p>
          </div>
          <div className="team">
            {TEAM.map((person) => (
              <div key={person.name} className="stack" style={{ gap: 14 }}>
                <div className="ph">
                  <span className="initials" aria-hidden="true">
                    {initialsOf(person.name)}
                  </span>
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="d" style={{ fontSize: 20 }}>
                    {person.name}
                  </span>
                  <span className="muted" style={{ fontSize: 15 }}>
                    {person.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="wrap stack" style={{ paddingBlockEnd: "clamp(80px, 9vw, 128px)", gap: 32 }}>
          <h2 className="h2">Where to go from here</h2>
          <div className="ctas2">
            <Link href="/match">
              <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                For clients
              </span>
              <span className="d" style={{ fontSize: 26, lineHeight: 1.2 }}>
                Tell us what you&apos;re facing. We&apos;ll find the person who has solved it.
              </span>
              <span className="link-arrow" style={{ color: "#2b4fe0" }}>
                Find my match{" "}
                <span className="ms af" aria-hidden="true">
                  arrow_forward
                </span>
              </span>
            </Link>
            <Link href="/become-an-expert" className="dark">
              <span style={{ fontSize: 14, fontWeight: 500, color: "#9ba1aa" }}>For experts</span>
              <span className="d" style={{ fontSize: 26, lineHeight: 1.2 }}>
                Somebody needs exactly what you know. Give them an hour, at your price.
              </span>
              <span className="link-arrow" style={{ color: "#7a94f0" }}>
                Become an expert{" "}
                <span className="ms af" aria-hidden="true">
                  arrow_forward
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
