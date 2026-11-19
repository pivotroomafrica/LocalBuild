import Link from "next/link";
import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getDirectoryForRequest } from "@/lib/public/cached";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { signOutAction } from "@/lib/auth/actions";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import "./waitlist.css";

/** The italic accent word in headings. */
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-wl-serif" });

export const metadata: Metadata = {
  title: "Pivotroom is opening soon",
  description:
    "Stop guessing. Talk to someone who has done it. Pivotroom connects investors and businesses with vetted Ethiopian founders, executives and professionals. Join the waitlist.",
};

const EXPERT_SIGNUP = "/auth/signup?next=/expert/onboarding";

type Ms = { icon: string; title: string; text: string };

const PROMISES: Ms[] = [
  { icon: "verified", title: "Vetted experts", text: "Founders, executives and professionals, each reviewed by our team." },
  { icon: "timer", title: "One focused hour", text: "Not a months-long retainer. A real conversation about your problem." },
  { icon: "route", title: "A clear next step", text: "Leave knowing what to do, and what to avoid." },
];

const DIASPORA_PAINS: Ms[] = [
  {
    icon: "link_off",
    title: "Advice that doesn't fit",
    text: "Generic consultants who don't know your sector, or how things really work on the ground in Ethiopia.",
  },
  {
    icon: "money_off",
    title: "Capital drained before launch",
    text: "Months of fees and reports, spent before the business has served a single customer.",
  },
  {
    icon: "flight_takeoff",
    title: "Investment pushed back out",
    text: "As the odds of success fall, the money leaves the country, and the opportunity with it.",
  },
];

const TRIAL_STEPS = ["Try an idea", "Wait months to see if it works", "It doesn't, quite", "Guess again"];
const PIVOT_STEPS = ["Book an hour with someone who solved it", "Get a plan built on real experience", "Act, with confidence"];

const HOW: Ms[] = [
  { icon: "flag", title: "Tell us your goal", text: "Expanding, raising finance, entering a market, fixing operations: whatever is in the way." },
  { icon: "person_search", title: "Pick the right expert", text: "Someone who has already done exactly that, here. Their experience is on their profile." },
  { icon: "forum", title: "Talk, then act", text: "One focused session online or in person, and you leave with a clear way forward." },
];

/**
 * The waitlist (070). While waitlist mode is on, the request proxy serves
 * this page for every address except the few left open (sign-in, expert
 * onboarding...), whatever was typed. A scrolling story: the problem
 * (diaspora investors, growing businesses), how Pivotroom solves it, and
 * its goal (speed, in control). Clients leave their details; experts go
 * through the AI onboarding now.
 */
export default async function WaitlistPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    experts,
  ] = await Promise.all([supabase.auth.getUser(), getDirectoryForRequest()]);

  // Real faces of published experts only; the strip is hidden without them.
  const faces = experts.filter((expert) => expert.photoUrl).slice(0, 5);

  let expertHref = EXPERT_SIGNUP;
  let expertLabel = "Apply as an expert";
  let expertNote = "Create your account, then our AI helps you build your profile in about 10 minutes.";
  if (user) {
    const { data: expert } = await supabase
      .from("expert_profiles")
      .select("application_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!expert || expert.application_status === "draft") {
      expertHref = "/expert/onboarding";
      expertLabel = expert ? "Continue your expert profile" : "Build your expert profile";
      expertNote = expert
        ? "Pick up where you left off. Your answers are saved."
        : "Our AI helps you build your profile in about 10 minutes.";
    } else if (expert.application_status === "approved") {
      expertHref = "/expert/dashboard";
      expertLabel = "Go to your expert dashboard";
      expertNote = "You're approved. Set your availability and price so you're ready on launch day.";
    } else {
      expertHref = "/expert/application";
      expertLabel = "See your application";
      expertNote = "We're reviewing your profile and will email you before we open.";
    }
  }

  return (
    <div className={`pr wl ${serif.variable}`}>
      <RevealOnScroll />
      <div className="wl-sky" aria-hidden="true">
        <span className="wl-cloud c1" />
        <span className="wl-cloud c2" />
        <span className="wl-cloud c3" />
      </div>

      <header className="wl-top">
        <BrandLogo size={30} />
        {user ? (
          <form action={signOutAction} className="wl-account">
            <span className="wl-who">{user.email}</span>
            <button type="submit" className="wl-pill-btn">
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/auth/login" className="wl-pill-btn">
            Log in
          </Link>
        )}
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="wl-hero" id="join">
          <span className="wl-mark" aria-hidden="true">
            <BrandLogo variant="icon" size={30} />
          </span>
          <p className="wl-badge">
            <span className="wl-dot" aria-hidden="true" />
            Opening soon
          </p>
          <h1 className="wl-h1">
            Stop guessing.
            <br />
            Talk to someone who&apos;s <em>done it.</em>
          </h1>
          <p className="wl-lede">
            Pivotroom connects investors and businesses with vetted Ethiopian founders, executives and professionals,
            so you reach your goal faster, and in control.
          </p>

          <WaitlistForm />

          {faces.length >= 3 ? (
            <div className="wl-faces">
              <span className="wl-face-row">
                {faces.map((face) => (
                  // eslint-disable-next-line @next/next/no-img-element -- storage URL
                  <img key={face.slug} src={face.photoUrl!} alt="" className="wl-face" />
                ))}
              </span>
              Vetted experts are already getting ready
            </div>
          ) : null}
          <p className="wl-expert-link">
            Are you an expert? <a href="#experts">Apply now</a>
          </p>

          <div className="wl-promises">
            {PROMISES.map((item, index) => (
              <div key={item.title} className="wl-promise" data-reveal style={{ "--d": index } as React.CSSProperties}>
                <span className="wl-icon ms" aria-hidden="true">
                  {item.icon}
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Diaspora investors ---------------- */}
        <section className="wl-section">
          <div className="wl-wrap">
            <p className="wl-eyebrow" data-reveal>
              For diaspora investors
            </p>
            <h2 className="wl-h2" data-reveal>
              Investing back home shouldn&apos;t <em>drain the investment.</em>
            </h2>
            <p className="wl-text" data-reveal>
              Many Ethiopian diaspora investors come home with capital and real ambition, and meet consulting that
              doesn&apos;t fit. Misaligned advice drains the capital, lowers the chance of success, and too often pushes
              the investment back out of the country.
            </p>
            <div className="wl-grid3">
              {DIASPORA_PAINS.map((item, index) => (
                <div key={item.title} className="wl-card" data-reveal style={{ "--d": index } as React.CSSProperties}>
                  <span className="wl-icon wl-icon-warn ms" aria-hidden="true">
                    {item.icon}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
            <div className="wl-answer" data-reveal>
              <span className="ms" aria-hidden="true">
                check_circle
              </span>
              <p>
                <strong>With Pivotroom</strong>, you speak first with someone who has already built in your sector, in
                Ethiopia, before you commit your capital.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- Growing businesses ---------------- */}
        <section className="wl-section wl-section-alt">
          <div className="wl-wrap">
            <p className="wl-eyebrow" data-reveal>
              For growing businesses
            </p>
            <h2 className="wl-h2" data-reveal>
              &ldquo;Let&apos;s try it&rdquo; is the most <em>expensive strategy.</em>
            </h2>
            <p className="wl-text" data-reveal>
              Mid-sized and large businesses hit obstacles all the time: expansion, financing, regulation, operations,
              a new market. Without someone who has solved it before, the answer becomes months of trial and error,
              and &ldquo;maybe this will work&rdquo;. Every wrong guess costs time, money, and more.
            </p>
            <div className="wl-compare">
              <div className="wl-path wl-path-slow" data-reveal>
                <p className="wl-path-label">
                  <span className="ms" aria-hidden="true">
                    sync_problem
                  </span>
                  Trial and error
                </p>
                <ol>
                  {TRIAL_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="wl-bar">
                  <span className="wl-bar-fill slow" />
                </div>
                <p className="wl-path-foot">Months. Time, money, morale and market position at risk.</p>
              </div>
              <div className="wl-path wl-path-fast" data-reveal style={{ "--d": 1 } as React.CSSProperties}>
                <p className="wl-path-label">
                  <span className="ms" aria-hidden="true">
                    bolt
                  </span>
                  With Pivotroom
                </p>
                <ol>
                  {PIVOT_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="wl-bar">
                  <span className="wl-bar-fill fast" />
                </div>
                <p className="wl-path-foot">Days. Decisions built on experience, not guesswork.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section className="wl-section">
          <div className="wl-wrap">
            <p className="wl-eyebrow" data-reveal>
              How Pivotroom works
            </p>
            <h2 className="wl-h2" data-reveal>
              The experience you need, <em>in one hour.</em>
            </h2>
            <div className="wl-grid3 wl-steps">
              {HOW.map((item, index) => (
                <div key={item.title} className="wl-card" data-reveal style={{ "--d": index } as React.CSSProperties}>
                  <span className="wl-step-num">{index + 1}</span>
                  <span className="wl-icon ms" aria-hidden="true">
                    {item.icon}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Goal ---------------- */}
        <section className="wl-goal">
          <div className="wl-wrap wl-goal-inner" data-reveal>
            <p className="wl-eyebrow wl-eyebrow-light">Our goal</p>
            <h2 className="wl-goal-title">
              Speed to your goal.
              <br />
              <em>In a controlled way.</em>
            </h2>
            <p className="wl-goal-text">
              Pivotroom exists so you reach the outcome you want faster, without losing control of your capital, your
              time or your direction. You choose the expert, you set the agenda, and you decide what happens next.
            </p>
            <a href="#join" className="wl-cta-light">
              Join the waitlist
              <span className="ms" aria-hidden="true">
                arrow_upward
              </span>
            </a>
          </div>
        </section>

        {/* ---------------- Experts ---------------- */}
        <section className="wl-section" id="experts">
          <div className="wl-wrap">
            <div className="wl-expert" data-reveal>
              <div className="wl-expert-copy">
                <p className="wl-eyebrow">For experts</p>
                <h2 className="wl-h2 wl-h2-left">
                  Your experience can save someone <em>months.</em>
                </h2>
                <p className="wl-text wl-text-left">
                  Founders, executives and professionals: share what you&apos;ve learned, one paid hour at a time, on
                  your own schedule. Get your profile ready now, so clients can book you from day one.
                </p>
              </div>
              <div className="wl-expert-box">
                <p className="wl-expert-note">{expertNote}</p>
                <Link href={expertHref} className="wl-btn-dark wl-btn-wide">
                  {expertLabel}
                  <span className="ms" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
                {!user ? (
                  <p className="wl-small">
                    Already started? <Link href="/auth/login?next=/expert/onboarding">Log in to continue</Link>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="wl-foot">
        <span>© {new Date().getFullYear()} Pivotroom</span>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="mailto:hello@pivotroom.africa">hello@pivotroom.africa</a>
      </footer>
    </div>
  );
}
