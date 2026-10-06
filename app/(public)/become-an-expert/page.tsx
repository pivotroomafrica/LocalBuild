import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  {
    step: "01",
    title: "Build your application",
    description: "Add your profile and photo, describe your expertise and who you help, and set your session lengths and prices.",
  },
  {
    step: "02",
    title: "Get reviewed",
    description: "The Pivotroom team reviews every application. We may approve it or ask for changes before it goes live.",
  },
  {
    step: "03",
    title: "Open your calendar",
    description: "Once approved, your profile is published. Add your monthly availability and customers can book you directly.",
  },
];

export default async function BecomeAnExpertPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts protects everything under /expert, so this link is safe to
  // point there directly even for a logged-out visitor -- they'll be sent
  // to /auth/login?next=/expert/application and land back here afterward.
  const applyHref = user
    ? "/expert/application"
    : `/auth/signup?next=${encodeURIComponent("/expert/application")}`;

  const loginHref = `/auth/login?next=${encodeURIComponent("/expert/application")}`;

  return (
    <div>
      <section className="hero-section">
        <div className="hero-glow-1" />
        <div className="hero-glow-2" />
        <div className="hero-container">
          <div className="hero-badge-pill">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Become an expert
          </div>
          <h1 className="hero-title">Share your experience through paid 1-on-1 sessions</h1>
          <p className="hero-subtitle">
            Apply to join Pivotroom as an expert. Tell us about your background, set the sessions you&apos;d like to
            offer, and submit your application for review.
          </p>

          {from === "availability" ? (
            <p className="mx-auto mb-8 max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#e7e5ec]">
              Availability is available after your expert application is approved.
            </p>
          ) : null}

          <div className="hero-ctas" style={{ flexDirection: "column" }}>
            <Link href={applyHref} className="btn-hero-primary">
              Apply to Become an Expert
            </Link>
            {!user ? (
              <p className="text-sm text-[#a9a6b2]">
                Already have a Pivotroom account?{" "}
                <Link href={loginHref} className="font-semibold text-white hover:underline">
                  Log in
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="how-container">
          <div className="how-header">
            <span className="how-tag">For experts</span>
            <h2 className="how-title">How applying works</h2>
            <p className="text-lg text-[#6a6871]">Three steps between you and your first booked session.</p>
          </div>

          <div className="how-steps-grid">
            {STEPS.map((item) => (
              <div key={item.step} className="how-step-card">
                <div className="how-step-num">{item.step}</div>
                <h3 className="how-step-title">{item.title}</h3>
                <p className="how-step-desc">{item.description}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-12 max-w-md text-center text-sm text-[var(--color-text-muted)]">
            Applying does not make you a public expert. Your application is reviewed before anything about you appears
            on Pivotroom.
          </p>
        </div>
      </section>
    </div>
  );
}
