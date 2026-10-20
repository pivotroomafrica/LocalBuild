import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Become an expert — Pivotroom" };

const TERMS = [
  {
    icon: "payments",
    k: "You name your price",
    v: "Choose the session lengths you offer and set your rate. Change it whenever you like.",
  },
  {
    icon: "receipt_long",
    k: "We keep 20%. Nothing else.",
    v: "No listing fee and no monthly charge. VAT is added to the client's price, not taken from yours.",
  },
  {
    icon: "schedule",
    k: "You open the hours",
    v: "Clients can only book slots you have opened. Close your calendar for a month and nobody will ask why.",
  },
  {
    icon: "check_circle",
    k: "The client pays first",
    v: "Every session is paid in full before it is confirmed. Your share is released once it has taken place.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Fill in your application",
    body: "Your background, the problems you have solved, who you help and a photo. Save it and come back whenever you like.",
  },
  {
    n: "02",
    title: "We review it",
    body: "Our team checks who you are and what you have done. This is why clients trust the names they see.",
  },
  {
    n: "03",
    title: "Your profile goes live",
    body: "Once approved, we publish your profile. Nothing about you appears on Pivotroom before that.",
  },
  {
    n: "04",
    title: "Set your price and hours",
    body: "Choose your session lengths, your rate and the slots you want to open.",
  },
  {
    n: "05",
    title: "Take your first booking",
    body: "Clients find you through search and through matching. You meet on Google Meet or in person.",
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
    body: "Name them. The more specific you are, the better we can match you with clients.",
  },
  {
    icon: "chat_bubble",
    title: "Plain answers",
    body: "You can tell someone what to do next in one session, without jargon and without a slide deck.",
  },
  {
    icon: "videocam",
    title: "You keep your word",
    body: "You arrive on time, on camera or in person, and you keep the slots you open.",
  },
];

const FAQS = [
  {
    q: "What does it cost me to join?",
    a: "Nothing. We earn 20% of the price of each session you take. If you take no sessions, you pay nothing.",
  },
  {
    q: "How and when am I paid?",
    a: "Clients pay through Chapa or by bank transfer when they book. Your 80% is released to you after the session has taken place.",
  },
  {
    q: "Who can see my profile?",
    a: "Anyone visiting Pivotroom, once it is approved and published. Your phone number and email are never shown.",
  },
  {
    q: "What if a client cancels late?",
    a: "Clients can cancel or reschedule themselves only until 24 hours before the session. Inside 24 hours the booking stands.",
  },
  {
    q: "Can I meet clients in person?",
    a: "Yes. Turn on in-person sessions and clients choose Google Meet or in person when they book.",
  },
  {
    q: "Do I have to take a minimum number of sessions?",
    a: "No. Open as many or as few slots as you like.",
  },
];

export default async function BecomeAnExpertPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts protects everything under /expert; a logged-out visitor
  // creates an account first and lands back on the application.
  const applyHref = user ? "/expert/application" : `/auth/signup?next=${encodeURIComponent("/expert/application")}`;
  const loginHref = `/auth/login?next=${encodeURIComponent("/expert/application")}`;

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
            book an hour with you and pay before it starts. You set the price. You choose the hours.
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
              Read the terms first{" "}
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
            <h2 className="h2">Four terms. Every one in writing.</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "52ch" }}>
              Here is exactly how the money works, before you give us a minute of your time.
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
            <h2 className="h2">What happens after you apply</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "44ch" }}>
              Five steps. Every expert takes all of them, however senior. It protects your name, and it protects the
              client&apos;s money.
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
            <h2 className="h2">We don&apos;t list job titles. We list people who solved something.</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "44ch" }}>
              Clients don&apos;t book a CV. They book the person who has already faced their problem. If that&apos;s
              you, you belong here.
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

      <section id="apply" className="ink" style={{ background: "#0d0f12", color: "#ffffff" }}>
        <div
          className="wrap stack"
          style={{ maxWidth: 820, paddingBlock: "clamp(96px, 10vw, 152px)", gap: 24, alignItems: "center", textAlign: "center" }}
        >
          <span className="ms" aria-hidden="true" style={{ fontSize: 28 }}>
            edit_note
          </span>
          <h2 className="h2" style={{ fontSize: "clamp(32px, 4.4vw, 60px)" }}>
            Apply in one sitting. Nothing goes live until we approve it.
          </h2>
          <p style={{ margin: 0, maxWidth: "52ch", color: "#9ba1aa", fontSize: 18 }}>
            Tell us what you&apos;ve built, who you&apos;ve helped and what you want to charge. Save and come back
            whenever you like.
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
