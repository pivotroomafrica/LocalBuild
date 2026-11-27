import Link from "next/link";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { signOutAction } from "@/lib/auth/actions";
import {
  JoinForm,
  WaitlistStickyBar,
} from "@/components/waitlist/WaitlistJoin";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import "../waitlist.css";

export const metadata: Metadata = {
  title: "Become a Pivotroom expert",
  description:
    "Share what you've learned with growing businesses in Ethiopia: paid one-to-one sessions, online or in person, at your price and on your schedule.",
};

type Item = { icon: string; title: string; text: string };

/** The money and the hours (same terms as /become-an-expert). */
const TERMS: Item[] = [
  {
    icon: "sell",
    title: "You set the price",
    text: "Choose your session lengths and your rate. Change either whenever you like.",
  },
  {
    icon: "receipt_long",
    title: "We keep 20%. Nothing else.",
    text: "No joining, listing or monthly fee. VAT is added to the client's price, not taken from yours.",
  },
  {
    icon: "verified_user",
    title: "Paid before you meet",
    text: "Every session is paid in full before it is confirmed. Your 80% is released after it has taken place.",
  },
  {
    icon: "schedule",
    title: "Your hours",
    text: "Clients can only book the time you open. As little as 2 hours a month, on the days you choose.",
  },
];

/** What being a Pivotroom expert gives you (all true of the product today). */
const GETS: Item[] = [
  {
    icon: "payments",
    title: "Paid for what you know",
    text: "Each session is income at the price you set, paid before you meet.",
  },
  {
    icon: "trending_up",
    title: "Work that moves a business",
    text: "One focused hour on a real problem, with someone ready to act on what you say.",
  },
  {
    icon: "badge",
    title: "A profile that shows your record",
    text: "Your experience, the problems you solve and what you have achieved, reviewed and presented properly.",
  },
  {
    icon: "volunteer_activism",
    title: "Room to give back",
    text: "Share part of your earnings with an Ethiopian NGO you choose, if you want to.",
  },
];

const STEPS: Item[] = [
  {
    icon: "person_add",
    title: "Create your account",
    text: "Two minutes, right on this page. Confirm your email and you're in.",
  },
  {
    icon: "auto_awesome",
    title: "Build your profile",
    text: "Answer a few questions, mostly by tapping, and we draft your profile from them. You edit and approve every word.",
  },
  {
    icon: "fact_check",
    title: "We review it",
    text: "Our team checks who you are and what you have done. Nothing about you is public before we approve it.",
  },
  {
    icon: "event_available",
    title: "Clients book you",
    text: "Set your hours and your price. Once Pivotroom opens, clients can find you and book a session.",
  },
];

const LOOK_FOR: Item[] = [
  {
    icon: "workspace_premium",
    title: "A record you can point to",
    text: "A company you built, a team you led, deals you closed, or many years in one field.",
  },
  {
    icon: "target",
    title: "Problems you've actually solved",
    text: "Name them. The more specific you are, the easier it is for the right clients to find you.",
  },
  {
    icon: "chat_bubble",
    title: "Plain answers",
    text: "You can tell someone what to do next in one session, without jargon and without a slide deck.",
  },
  {
    icon: "alarm_on",
    title: "You show up",
    text: "On time, prepared, on camera or in the room.",
  },
];

const FAQS = [
  {
    q: "Does it cost anything to join?",
    a: "No. There's no joining, listing or monthly fee. We only keep 20% of the sessions you're booked for.",
  },
  {
    q: "How do I get paid?",
    a: "After each session, your share is paid to the bank or mobile money account in your name, and we email you when it has been sent.",
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
    q: "Who sees my phone and email?",
    a: "Nobody. Clients see your public profile only: your phone number and email are never shown.",
  },
  {
    q: "Can I give part of my earnings to a cause?",
    a: "Yes. Choose an Ethiopian NGO and the share you want to give. Your profile shows the organisation with a gold mark; the percentage stays private.",
  },
];

/**
 * The expert side of the waitlist (070): the full case for joining, with
 * the expert sign-up form on the page. Open during waitlist mode (it lives
 * under /waitlist), linked from the waitlist page.
 */
export default async function WaitlistExpertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let next: { href: string; label: string; note: string } | null = null;
  if (user) {
    const { data: expert } = await supabase
      .from("expert_profiles")
      .select("application_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!expert || expert.application_status === "draft") {
      next = {
        href: "/expert/onboarding",
        label: expert
          ? "Continue your expert profile"
          : "Build your expert profile",
        note: expert
          ? "Pick up where you left off. Your answers are saved."
          : "You're signed in. Build your profile with our AI now.",
      };
    } else if (expert.application_status === "approved") {
      next = {
        href: "/expert/dashboard",
        label: "Go to your expert dashboard",
        note: "You're approved. Set your hours and price so you're ready on launch day.",
      };
    } else {
      next = {
        href: "/expert/application",
        label: "See your application",
        note: "We're reviewing your profile and will email you before we open.",
      };
    }
  }

  const item = (entry: Item, index: number, extra = "") => (
    <div
      key={entry.title}
      className={`wl-card ${extra}`}
      data-reveal
      style={{ "--d": index } as React.CSSProperties}
    >
      <span className="wl-icon ms" aria-hidden="true">
        {entry.icon}
      </span>
      <h3>{entry.title}</h3>
      <p>{entry.text}</p>
    </div>
  );

  return (
    <div className="pr wl">
      <RevealOnScroll />
      <div className="wl-sky" aria-hidden="true">
        <span className="wl-cloud c1" />
        <span className="wl-cloud c2" />
        <span className="wl-cloud c3" />
      </div>

      <header className="wl-top">
        <Link
          href="/waitlist"
          aria-label="Pivotroom home"
          className="wl-logo-link"
        >
          <BrandLogo size={28} label="" className="wl-logo" />
        </Link>
        <div className="wl-account">
          <Link href="/waitlist" className="wl-top-link">
            For clients
          </Link>
          {user ? (
            <form action={signOutAction}>
              <button type="submit" className="btn btn-line wl-top-btn">
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/auth/login?next=/expert/onboarding"
              className="btn btn-line wl-top-btn"
            >
              Log in
            </Link>
          )}
        </div>
      </header>

      <main>
        {/* ---------------- Hero + form ---------------- */}
        <section className="wl-xhero">
          <div className="wl-xhero-copy">
            <p className="wl-badge">
              <span className="wl-dot" aria-hidden="true" />
              For experts · Opening soon
            </p>
            <h1 className="h1 wl-xh1">
              Your experience can shorten{" "}
              <span className="wl-acc">someone else&apos;s path.</span>
            </h1>
            <p className="lede wl-xlede">
              Pivotroom connects experienced founders, executives and
              specialists with businesses facing problems they have already
              solved. Clients book a paid one-to-one session with you, online
              or in person, at the price you set and the hours you choose.
            </p>
            <ul className="wl-xpoints">
              <li>
                <span className="ms" aria-hidden="true">
                  check
                </span>
                No fee to join. We keep 20% of sessions, nothing else.
              </li>
              <li>
                <span className="ms" aria-hidden="true">
                  check
                </span>
                Paid in full before every session.
              </li>
              <li>
                <span className="ms" aria-hidden="true">
                  check
                </span>
                Our AI drafts your profile in about ten minutes.
              </li>
            </ul>
          </div>

          <div className="wl-xform" id="apply" data-join-forms>
            {next ? (
              <div className="wl-done">
                <p className="wl-done-text">{next.note}</p>
                <Link
                  href={next.href}
                  className="btn btn-ink lg block"
                  style={{ marginTop: 16 }}
                >
                  {next.label}
                  <span className="ms" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </div>
            ) : (
              <JoinForm who="expert" />
            )}
          </div>
        </section>

        {/* ---------------- What you bring ---------------- */}
        <section className="wl-goal">
          <div className="wl-wrap wl-goal-inner" data-reveal>
            <p className="eyebrow wl-eyebrow wl-eyebrow-light">What you bring</p>
            <h2 className="h1 wl-goal-title">
              What took you years to learn,{" "}
              <span className="wl-acc">they need this month.</span>
            </h2>
            <p className="wl-goal-text">
              Growing businesses often meet a problem for the first time:
              a loan application, a new market, a regulator, a team that
              stopped working. You have been there. In one focused hour you can
              tell them what to do first, what to avoid and what it really
              takes. They arrive with a real problem and leave with a next
              step.
            </p>
          </div>
        </section>

        {/* ---------------- What you get ---------------- */}
        <section className="wl-section">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              What you get
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              Meaningful work, <span className="wl-acc">on your terms.</span>
            </h2>
            <div className="wl-grid4">
              {GETS.map((entry, index) => item(entry, index, "wl-card-sm"))}
            </div>
          </div>
        </section>

        {/* ---------------- The terms ---------------- */}
        <section className="wl-section wl-section-alt">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              The money and the hours
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              How the money works, <span className="wl-acc">plainly.</span>
            </h2>
            <div className="wl-grid4">
              {TERMS.map((entry, index) => item(entry, index, "wl-card-sm"))}
            </div>
          </div>
        </section>

        {/* ---------------- How you go live ---------------- */}
        <section className="wl-section">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              How you go live
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              From sign-up to your first session,{" "}
              <span className="wl-acc">in four steps.</span>
            </h2>
            <div className="wl-grid4 wl-steps">
              {STEPS.map((entry, index) => (
                <div
                  key={entry.title}
                  className="wl-card wl-card-sm"
                  data-reveal
                  style={{ "--d": index } as React.CSSProperties}
                >
                  <span className="wl-step-num">{index + 1}</span>
                  <span className="wl-icon ms" aria-hidden="true">
                    {entry.icon}
                  </span>
                  <h3>{entry.title}</h3>
                  <p>{entry.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Who we look for ---------------- */}
        <section className="wl-section wl-section-alt">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              Who we&apos;re looking for
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              Experts with a record{" "}
              <span className="wl-acc">clients can rely on.</span>
            </h2>
            <p className="wl-text" data-reveal>
              Our team reviews every profile before it goes live, so clients
              can trust who they book.
            </p>
            <div className="wl-grid4">
              {LOOK_FOR.map((entry, index) => item(entry, index, "wl-card-sm"))}
            </div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="wl-section">
          <div className="wl-wrap wl-faq-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              Questions
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              What experts <span className="wl-acc">ask us.</span>
            </h2>
            <div className="wl-faq" data-reveal>
              {FAQS.map((faq) => (
                <details key={faq.q} className="wl-faq-item">
                  <summary>
                    {faq.q}
                    <span className="ms" aria-hidden="true">
                      add
                    </span>
                  </summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Final call ---------------- */}
        <section className="wl-section wl-section-alt">
          <div className="wl-wrap wl-final" data-reveal>
            <h2 className="h2 wl-h2">
              Ready to share <span className="wl-acc">what you know?</span>
            </h2>
            <p className="wl-text">
              Build your profile now. Your answers save as you go, and nothing
              is public until our team has reviewed it.
            </p>
            <a href="#apply" className="btn btn-ink lg wl-final-btn">
              Apply as an expert
              <span className="ms" aria-hidden="true">
                arrow_upward
              </span>
            </a>
          </div>
        </section>
      </main>

      {!user ? <WaitlistStickyBar expertOnly /> : null}

      <footer className="wl-foot">
        <InstallAppButton className="wl-install" />
        <span>© {new Date().getFullYear()} Pivotroom</span>
        <Link href="/waitlist">For clients</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="mailto:hello@pivotroom.africa">hello@pivotroom.africa</a>
      </footer>
    </div>
  );
}
