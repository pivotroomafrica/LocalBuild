import Link from "next/link";
import { PairSequence, type Pair } from "@/components/waitlist/PairSequence";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getDirectoryForRequest } from "@/lib/public/cached";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { signOutAction } from "@/lib/auth/actions";
import {
  WaitlistJoin,
  WaitlistStickyBar,
} from "@/components/waitlist/WaitlistJoin";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import "./waitlist.css";

export const metadata: Metadata = {
  title: "Pivotroom is opening soon",
  description:
    "Stop guessing. Talk to someone who has done it. Pivotroom connects investors and businesses with vetted Ethiopian founders, executives and professionals. Join the waitlist.",
};

/** Opens the expert form in the hero (WaitlistJoin listens for it). */
const EXPERT_SIGNUP = "#join-expert";

type Ms = { icon: string; title: string; text: string };

const PROMISES: Ms[] = [
  {
    icon: "verified",
    title: "Vetted, not volunteered",
    text: "Every expert is reviewed by our team before their profile goes live. Their track record is on the page, not in a sales pitch.",
  },
  {
    icon: "timer",
    title: "An hour, not a retainer",
    text: "No six-month contract to find out whether the advice is any good. One focused session, at a price you see before you book.",
  },
  {
    icon: "route",
    title: "You leave with a decision",
    text: "Not a sixty-page report. A clearer view of what to do next, and just as usefully, what to stop doing.",
  },
];



/** Each problem, and Pivotroom's answer to it, in one card. */
const DIASPORA: Pair[] = [
  {
    icon: "public_off",
    problem: "Advice built for somewhere else",
    problemText:
      "Frameworks from other markets, applied to licences, suppliers and banks their authors have never dealt with.",
    fix: "Advice from someone who built here",
    fixText:
      "Talk to an expert who has done it in Ethiopia, in your sector, recently.",
  },
  {
    icon: "hourglass_bottom",
    problem: "Paying to learn the basics",
    problemText:
      "Weeks of fees before anyone tells you what an experienced operator would have said in the first ten minutes.",
    fix: "The basics in the first ten minutes",
    fixText:
      "One focused hour at a price you see up front, not a retainer that runs for months.",
  },
  {
    icon: "flight_takeoff",
    problem: "A good idea, lost",
    problemText:
      "When the money runs low before the business runs well, the investment goes back abroad, and the opportunity with it.",
    fix: "Capital kept for the business",
    fixText: "Find the flaws in your plan before you spend on them, not after.",
  },
];

const TRIAL_STEPS = [
  "Guess at a fix",
  "Spend months finding out",
  "Learn it only half worked",
  "Guess again",
];
const PIVOT_STEPS = [
  "Talk to someone who has fixed exactly this",
  "Hear what worked, and what quietly failed",
  "Act on a plan you can defend",
];

const HOW: Ms[] = [
  {
    icon: "flag",
    title: "Name the goal",
    text: "Raising finance, entering a market, fixing operations, deciding on an investment. Start with whatever is in the way.",
  },
  {
    icon: "person_search",
    title: "Choose who has done it",
    text: "Read real profiles: what each expert has built, where, and what they help with. You choose. Nobody is assigned to you.",
  },
  {
    icon: "forum",
    title: "Talk, then decide",
    text: "Meet on Google Meet or in person, for the price you saw before booking. Leave knowing your next move.",
  },
];

/** Things that make it safe to ask (all true of the product today). */
const SAFE: Ms[] = [
  {
    icon: "fact_check",
    title: "Reviewed experts only",
    text: "No profile goes live until our team has approved it.",
  },
  {
    icon: "sell",
    title: "The price, up front",
    text: "You see exactly what an hour costs before you book. No surprises after.",
  },
  {
    icon: "lock",
    title: "Pay safely in ETB",
    text: "Pay online or by bank transfer, confirmed before your session.",
  },
  {
    icon: "event_repeat",
    title: "Plans change",
    text: "Need another time? Move your session from your account.",
  },
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
  /** Signed in without an expert profile: a client on the list. */
  let clientName: string | null = null;
  let expertLabel = "Apply as an expert";
  let expertNote =
    "Create your account right here. Our AI then turns a few quick answers into your profile, in about 10 minutes.";
  if (user) {
    const { data: expert } = await supabase
      .from("expert_profiles")
      .select("application_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!expert) {
      // Clients who joined with an account (or Google) are on the list:
      // make sure their row is there for Admin -> Waitlist.
      const { data: me } = await supabase
        .from("profiles")
        .select("full_name, first_name, phone, country, city")
        .eq("id", user.id)
        .maybeSingle();
      clientName = me?.first_name || me?.full_name?.split(" ")[0] || "";
      if (user.email && me?.full_name) {
        await supabase.rpc("join_waitlist", {
          p_full_name: me.full_name,
          p_email: user.email,
          p_phone: me.phone ?? "",
          p_country: me.country ?? "",
          p_city: me.city ?? "",
          p_interest: "",
        });
      }
    }
    if (!expert || expert.application_status === "draft") {
      expertHref = "/expert/onboarding";
      expertLabel = expert
        ? "Continue your expert profile"
        : "Build your expert profile";
      expertNote = expert
        ? "Pick up where you left off. Your answers are saved."
        : "Our AI helps you build your profile in about 10 minutes.";
    } else if (expert.application_status === "approved") {
      expertHref = "/expert/dashboard";
      expertLabel = "Go to your expert dashboard";
      expertNote =
        "You're approved. Set your availability and price so you're ready on launch day.";
    } else {
      expertHref = "/expert/application";
      expertLabel = "See your application";
      expertNote =
        "We're reviewing your profile and will email you before we open.";
    }
  }

  return (
    <div className="pr wl">
      <RevealOnScroll />
      <div className="wl-sky" aria-hidden="true">
        <span className="wl-cloud c1" />
        <span className="wl-cloud c2" />
        <span className="wl-cloud c3" />
      </div>

      <header className="wl-top">
        <BrandLogo size={28} className="wl-logo" />
        {user ? (
          <form action={signOutAction} className="wl-account">
            <span className="wl-who">{user.email}</span>
            <button type="submit" className="btn btn-line wl-top-btn">
              Sign out
            </button>
          </form>
        ) : (
          <div className="wl-account">
            <Link href="/waitlist/experts" className="wl-top-link">
              For experts
            </Link>
            <Link href="/auth/login" className="btn btn-line wl-top-btn">
              Log in
            </Link>
          </div>
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
            Opening soon in Ethiopia
          </p>
          <h1 className="h1 wl-h1">
            Borrow ten years of experience.{" "}
            <span className="wl-acc">For one hour.</span>
          </h1>
          <p className="lede wl-lede">
            Pivotroom sits you across the table from vetted Ethiopian founders,
            executives and specialists who have already solved the problem in
            front of you. You pay for an hour. You get the years behind it.
          </p>

          {!user ? (
            <WaitlistJoin />
          ) : clientName !== null ? (
            <div className="wl-done wl-hero-done">
              <span className="wl-done-icon ms" aria-hidden="true">
                task_alt
              </span>
              <h3 className="wl-done-title">
                You&apos;re on the list{clientName ? `, ${clientName}` : ""}
              </h3>
              <p className="wl-done-text">
                Your account is ready. We&apos;ll email you the moment Pivotroom
                opens, then you just log in and book. Are you an expert too?{" "}
                <Link href="/expert/onboarding">Build your expert profile</Link>
                .
              </p>
            </div>
          ) : (
            <div className="wl-done wl-hero-done">
              <p className="wl-done-text">{expertNote}</p>
              <Link
                href={expertHref}
                className="btn btn-ink lg"
                style={{ marginTop: 16 }}
              >
                {expertLabel}
                <span className="ms" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          )}

          <InstallAppButton className="wl-install wl-install-hero" />

          {faces.length >= 3 ? (
            <div className="wl-faces">
              <span className="wl-face-row">
                {faces.map((face) => (
                  // eslint-disable-next-line @next/next/no-img-element -- storage URL
                  <img
                    key={face.slug}
                    src={face.photoUrl!}
                    alt=""
                    className="wl-face"
                  />
                ))}
              </span>
              Vetted experts are already getting ready
            </div>
          ) : null}

          <div className="wl-promises">
            {PROMISES.map((item, index) => (
              <div
                key={item.title}
                className="wl-promise"
                data-reveal
                style={{ "--d": index } as React.CSSProperties}
              >
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
            <p className="eyebrow wl-eyebrow" data-reveal>
              For the diaspora investor
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              The most expensive advice is the advice that{" "}
              <span className="wl-acc">almost fits.</span>
            </h2>
            <p className="wl-text" data-reveal>
              You earned the capital abroad. You know the opportunity at home is
              real. What you don&apos;t have is someone who has done this exact
              thing, here, recently. So you hire general consultants, wait for
              reports and pay as you learn. By the time the gaps show, the
              capital is thinner, the odds are worse, and the money often goes
              back where it came from. Ethiopia loses an investor. You lose
              years.
            </p>
            <PairSequence pairs={DIASPORA} />
            <div className="wl-answer" data-reveal>
              <p>
                <strong>Before you commit a single birr</strong>, sit down with
                someone who has built in your sector, in Ethiopia. One hour can
                tell you which half of your plan is wrong. It may be the
                cheapest hour of the whole investment.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- Growing businesses ---------------- */}
        <section className="wl-section wl-section-alt">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              For growing companies
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              Trial and error is a strategy.{" "}
              <span className="wl-acc">It&apos;s just a very slow one.</span>
            </h2>
            <p className="wl-text" data-reveal>
              Every mid-sized and large business hits a wall eventually: a new
              market, a financing round, a regulator, an operation that
              won&apos;t scale. Most solve it the hard way. Try something, wait,
              measure, try again. It feels prudent. It is often the most
              expensive option on the table, paid for in months, money, staff
              morale and market position you don&apos;t get back.
            </p>
            <div className="wl-compare">
              <div className="wl-path wl-path-slow" data-reveal>
                <p className="wl-tag wl-tag-bad">
                  <span className="ms" aria-hidden="true">
                    close
                  </span>
                  Without Pivotroom
                </p>
                <p className="wl-path-label">Trial and error</p>
                <ol>
                  {TRIAL_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="wl-bar">
                  <span className="wl-bar-fill slow" />
                </div>
                <p className="wl-path-foot">
                  Months. Paid for in time, money, morale and market share.
                </p>
              </div>
              <div
                className="wl-path wl-path-fast"
                data-reveal
                style={{ "--d": 1 } as React.CSSProperties}
              >
                <p className="wl-tag wl-tag-good">
                  <span className="ms" aria-hidden="true">
                    check
                  </span>
                  With Pivotroom
                </p>
                <p className="wl-path-label">One hour with someone who knows</p>
                <ol>
                  {PIVOT_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="wl-bar">
                  <span className="wl-bar-fill fast" />
                </div>
                <p className="wl-path-foot">
                  Days. Your decisions start where their experience ends.
                </p>
              </div>
            </div>
            <p className="wl-quote" data-reveal>
              The real question isn&apos;t whether an hour is worth the fee.
              It&apos;s what the next six months of guessing will cost.
            </p>
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section className="wl-section">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              How it works
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              From question to decision,{" "}
              <span className="wl-acc">in three steps.</span>
            </h2>
            <div className="wl-grid3 wl-steps">
              {HOW.map((item, index) => (
                <div
                  key={item.title}
                  className="wl-card"
                  data-reveal
                  style={{ "--d": index } as React.CSSProperties}
                >
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

        {/* ---------------- Safe to ask ---------------- */}
        <section className="wl-section wl-section-alt">
          <div className="wl-wrap">
            <p className="eyebrow wl-eyebrow" data-reveal>
              Why it&apos;s safe to ask
            </p>
            <h2 className="h2 wl-h2" data-reveal>
              Asking for help should be the{" "}
              <span className="wl-acc">low-risk part.</span>
            </h2>
            <p className="wl-text" data-reveal>
              The decision you&apos;re facing is risky enough. So we took the
              risk out of getting advice on it.
            </p>
            <div className="wl-grid4">
              {SAFE.map((item, index) => (
                <div
                  key={item.title}
                  className="wl-card wl-card-sm"
                  data-reveal
                  style={{ "--d": index } as React.CSSProperties}
                >
                  <span className="wl-icon wl-icon-soft ms" aria-hidden="true">
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
            <p className="eyebrow wl-eyebrow wl-eyebrow-light">Our goal</p>
            <h2 className="h1 wl-goal-title">
              Speed to your goal.
              <br />
              <span className="wl-acc">In a controlled way.</span>
            </h2>
            <p className="wl-goal-text">
              Speed alone is easy: you can always move fast in the wrong
              direction. Control alone is easy too: you can study a decision
              until the moment has passed. Pivotroom gives you both. The
              shortcut of someone else&apos;s experience, with every decision
              still yours. You choose the expert. You set the agenda. You decide
              what happens next.
            </p>
            <a href="#join" className="btn btn-white lg wl-goal-btn">
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
                <p className="eyebrow wl-eyebrow">For experts</p>
                <h2 className="h2 wl-h2 wl-h2-left">
                  Your experience took years to earn.{" "}
                  <span className="wl-acc">Let it earn again.</span>
                </h2>
                <p className="wl-text wl-text-left">
                  You&apos;ve already solved problems other people are only now
                  running into. On Pivotroom you share that, one paid hour at a
                  time, on your schedule and at your price. No pitching, no
                  proposals: clients arrive having already chosen you. If you
                  like, give part of every session to a cause you care about.
                  Build your profile now, and be bookable from day one.
                </p>
              </div>
              <div className="wl-expert-box">
                <p className="wl-expert-note">{expertNote}</p>
                {expertHref.startsWith("#") ? (
                  <a href={expertHref} className="btn btn-ink lg block">
                    {expertLabel}
                    <span className="ms" aria-hidden="true">
                      arrow_upward
                    </span>
                  </a>
                ) : (
                  <Link href={expertHref} className="btn btn-ink lg block">
                    {expertLabel}
                    <span className="ms" aria-hidden="true">
                      arrow_forward
                    </span>
                  </Link>
                )}
                {!user ? (
                  <p className="wl-small">
                    Already have an account?{" "}
                    <Link href="/auth/login?next=/expert/onboarding">
                      Log in to continue
                    </Link>
                  </p>
                ) : null}
                <p className="wl-expert-more">
                  <Link
                    href="/waitlist/experts"
                    className="btn btn-line md block"
                  >
                    Everything experts need to know
                    <span className="ms" aria-hidden="true">
                      arrow_forward
                    </span>
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {!user ? <WaitlistStickyBar /> : null}

      <footer className="wl-foot">
        <InstallAppButton className="wl-install" />
        <span>© {new Date().getFullYear()} Pivotroom</span>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="mailto:hello@pivotroom.africa">hello@pivotroom.africa</a>
      </footer>
    </div>
  );
}
