import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { signOutAction } from "@/lib/auth/actions";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import "./waitlist.css";

export const metadata: Metadata = {
  title: "Pivotroom is opening soon",
  description:
    "One hour with someone who has done it. Join the Pivotroom waitlist, or apply as an expert and build your profile before we open.",
};

const EXPERT_SIGNUP = "/auth/signup?next=/expert/onboarding";

/**
 * The waitlist (070). While waitlist mode is on, the request proxy serves
 * this page for every address except the few left open (sign-in, expert
 * onboarding...), whatever was typed. Clients leave their details;
 * experts go through the AI onboarding now.
 */
export default async function WaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <div className="pr wl">
      <div className="wl-bg" aria-hidden="true" />
      <header className="wl-top">
        <span className="wl-logo">
          <BrandLogo size={30} />
        </span>
        {user ? (
          <form action={signOutAction} className="wl-account">
            <span className="wl-who">{user.email}</span>
            <button type="submit" className="wl-link">
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/auth/login" className="wl-login">
            Log in
          </Link>
        )}
      </header>

      <main className="wl-main">
        <section className="wl-hero">
          <p className="wl-eyebrow">
            <span className="wl-dot" aria-hidden="true" />
            Opening soon
          </p>
          <h1 className="wl-title">One hour with someone who has done it.</h1>
          <p className="wl-lede">
            Pivotroom connects you with vetted Ethiopian founders, executives and professionals for paid one-to-one
            sessions. We&apos;re getting ready to open. Join the waitlist and be first in.
          </p>
          <ul className="wl-points">
            <li>
              <span className="ms" aria-hidden="true">
                verified
              </span>
              Every expert reviewed by our team
            </li>
            <li>
              <span className="ms" aria-hidden="true">
                videocam
              </span>
              Online on Google Meet, or in person
            </li>
            <li>
              <span className="ms" aria-hidden="true">
                payments
              </span>
              Pay securely in ETB
            </li>
          </ul>
          <div className="wl-jump">
            <a href="#wl-client" className="wl-jump-btn">
              Join the waitlist
            </a>
            <a href="#wl-expert" className="wl-jump-btn wl-jump-line">
              I&apos;m an expert
            </a>
          </div>
        </section>

        <div className="wl-cards">
          <section id="wl-client" className="wl-card" aria-labelledby="wl-client-title">
            <h2 id="wl-client-title" className="wl-card-title">
              <span className="ms" aria-hidden="true">
                person_search
              </span>
              I want expert advice
            </h2>
            <p className="wl-card-sub">Leave your details and we&apos;ll let you know the moment we open.</p>
            <WaitlistForm />
          </section>

          <section id="wl-expert" className="wl-card wl-card-expert" aria-labelledby="wl-expert-title">
            <h2 id="wl-expert-title" className="wl-card-title">
              <span className="ms" aria-hidden="true">
                workspace_premium
              </span>
              I&apos;m an expert
            </h2>
            <p className="wl-card-sub">
              Founders, executives and professionals: get your profile ready now, so clients can book you from day
              one.
            </p>
            <p className="wl-expert-note">{expertNote}</p>
            <Link href={expertHref} className="btn btn-ink lg wl-expert-btn">
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
          </section>
        </div>
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
