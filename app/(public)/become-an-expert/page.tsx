import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Become an expert — Pivotroom" };

/** The money and the hours: said once, here. */
const TERMS = [
  {
    icon: "payments",
    k: "You set the price",
    v: "Pick your session lengths and your rate. Change either whenever you like.",
  },
  {
    icon: "receipt_long",
    k: "We keep 20%. Nothing else.",
    v: "No joining, listing or monthly fee. VAT is added to the client's price, not taken from yours.",
  },
  {
    icon: "check_circle",
    k: "Paid before you meet",
    v: "Every session is paid in full before it is confirmed. Your 80% is released after it has taken place.",
  },
  {
    icon: "schedule",
    k: "Your hours, no minimum",
    v: "Clients can only book the slots you open. Open many, a few, or none for a month.",
  },
];

/** From application to first booking; review and privacy live here. */
const STEPS = [
  {
    n: "01",
    title: "Apply",
    body: "Three short steps: introduce yourself, the problems you have solved, and your sessions and price. Save and finish later if you need to.",
  },
  {
    n: "02",
    title: "We review it",
    body: "Our team checks who you are and what you have done. Nothing about you is public before we approve it, and your phone and email are never shown.",
  },
  {
    n: "03",
    title: "Go live and get booked",
    body: "Open your hours and clients find you by name or by topic. You meet on Google Meet or in person.",
  },
];

const LOOK_FOR = [
  {
    icon: "verified",
    title: "A record you can point to",
    body: "A company you built, a team you led, deals you closed, or ten years in one field.",
  },
  {
    icon: "person",
    title: "Problems you have actually solved",
    body: "Name them. The more specific you are, the easier it is for the right clients to find you.",
  },
  {
    icon: "chat_bubble",
    title: "Plain answers",
    body: "You can tell someone what to do next in one session, without jargon and without a slide deck.",
  },
  {
    icon: "event_available",
    title: "You show up",
    body: "On time, prepared, on camera or in the room.",
  },
];

/** Only what the sections above don't already answer. */
const FAQS = [
  {
    q: "What if a client cancels late?",
    a: "Clients can cancel or reschedule themselves only until 24 hours before the session. Inside 24 hours the booking stands.",
  },
  {
    q: "Can I meet clients in person?",
    a: "Yes. Turn on in-person sessions and clients choose Google Meet or in person when they book.",
  },
  {
    q: "How do I get paid?",
    a: "After each session, your share is paid to the bank or mobile money account in your name, and we email you when it has been sent.",
  },
  {
    q: "Can I give part of my earnings to a cause?",
    a: "Yes. Choose an Ethiopian NGO and the share of your earnings you want to give. Your profile shows the organisation with a gold mark; the percentage stays private.",
  },
];

export default async function BecomeAnExpertPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts protects everything under /expert; a logged-out visitor
  // creates an account first and lands back on the guided onboarding (which
  // sends anyone whose application is already submitted to /expert/application).
  const applyHref = user ? "/expert/onboarding" : `/auth/signup?next=${encodeURIComponent("/expert/onboarding")}`;
  const loginHref = `/auth/login?next=${encodeURIComponent("/expert/onboarding")}`;

  return (
    <>
      <section className="xhero" aria-labelledby="apply-title">
        <div className="xh-in">
          <Link className="xh-pill" href={applyHref}>
            <span className="xh-dot" aria-hidden="true" />
            Applications open for our founding experts{" "}
            <span className="ms" aria-hidden="true" style={{ fontSize: 16, color: "#5c616a" }}>
              chevron_right
            </span>
          </Link>
          <h1 id="apply-title" className="xh-h">
            The mistakes you have already paid for are worth something to someone else.
          </h1>
          <p className="xh-p">
            Somewhere in Ethiopia a founder is about to make a mistake you learned from years ago. On Pivotroom they
            book an hour with you.
          </p>
          {from === "availability" ? (
            <p className="notice" style={{ margin: 0 }}>
              Availability opens after your expert application is approved.
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "12px 24px", marginTop: 8 }}>
            <Link href={applyHref} className="btn btn-ink icta">
              Start your application{" "}
              <span className="icta-i" aria-hidden="true">
                <span className="ms af" style={{ fontSize: 16 }}>
                  arrow_forward
                </span>
              </span>
            </Link>
            <a href="#terms" className="link-arrow" style={{ minHeight: 44, color: "#0d0f12" }}>
              How it works{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </a>
          </div>
        </div>
      </section>

      <section id="terms" style={{ background: "#ffffff" }}>
        <div className="wrap section stack" style={{ gap: 40 }}>
          <div className="stack" style={{ gap: 12 }}>
            <h2 className="h2">How the money and the hours work</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "52ch" }}>
              Four terms, all in writing.
            </p>
          </div>
          <div className="terms4">
            {TERMS.map((term) => (
              <div key={term.k}>
                <span className="ms" aria-hidden="true" style={{ fontSize: 22 }}>
                  {term.icon}
                </span>
                <span className="d" style={{ fontSize: 19, lineHeight: 1.25 }}>
                  {term.k}
                </span>
                <span className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>
                  {term.v}
                </span>
              </div>
            ))}
          </div>
          <Link href="/expert-terms" className="link-arrow" style={{ alignSelf: "flex-start" }}>
            Read the full expert terms{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </section>

      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap section split">
          <div className="stack" style={{ gap: 16 }}>
            <h2 className="h2">From application to first booking</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "44ch" }}>
              Every expert goes through the same review, however senior. It is why clients trust the names they see.
            </p>
          </div>
          <ol className="steplist">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="muted num" style={{ fontSize: 14, fontWeight: 500 }}>
                  {step.n}
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
        <div className="wrap section split">
          <div className="stack" style={{ gap: 16 }}>
            <h2 className="h2">Who we are looking for</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "44ch" }}>
              Clients don&apos;t book a CV. They book the person who has already faced their problem.
            </p>
          </div>
          <ul className="lookfor">
            {LOOK_FOR.map((item) => (
              <li key={item.title}>
                <span className="ms" aria-hidden="true" style={{ fontSize: 22 }}>
                  {item.icon}
                </span>
                <span className="d" style={{ fontSize: 18 }}>
                  {item.title}
                </span>
                <span className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>
                  {item.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap section giveback-band">
          <span className="ms gold-mark" aria-hidden="true">
            verified
          </span>
          <div className="stack" style={{ gap: 8 }}>
            <h2 className="h2" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
              Give part of your earnings to a cause
            </h2>
            <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
              Choose an Ethiopian NGO and how much you want to give. Clients see the organisation on your profile and
              your verified mark turns gold. The amount stays between you and us.
            </p>
          </div>
        </div>
      </section>

      <section id="apply" className="ink" style={{ background: "#0d0f12", color: "#ffffff" }}>
        <div
          className="wrap stack"
          style={{ maxWidth: 820, paddingBlock: "clamp(96px, 10vw, 152px)", gap: 24, alignItems: "center", textAlign: "center" }}
        >
          <span className="ms" aria-hidden="true" style={{ fontSize: 28 }}>
            edit_note
          </span>
          <h2 className="h2" style={{ fontSize: "clamp(32px, 4.4vw, 60px)" }}>
            Ready when you are.
          </h2>
          <p style={{ margin: 0, maxWidth: "52ch", color: "#9ba1aa", fontSize: 18 }}>
            Most experts finish their application in about ten minutes.
          </p>
          <Link href={applyHref} className="btn btn-white lg">
            Start your application{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
          <span style={{ fontSize: 14, color: "#9ba1aa" }}>
            Free to apply · By applying you agree to the{" "}
            <Link href="/expert-terms" className="lk">
              expert terms
            </Link>
            {!user ? (
              <>
                {" "}
                · Already have an account?{" "}
                <Link href={loginHref} className="lk">
                  Sign in
                </Link>
              </>
            ) : null}
          </span>
        </div>
      </section>

      <section style={{ background: "#ffffff" }}>
        <div className="wrap section stack" style={{ maxWidth: 880, gap: 32 }}>
          <h2 className="h2">Questions experts ask us</h2>
          <div className="faqs">
            {FAQS.map((faq) => (
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
        </div>
      </section>
    </>
  );
}
