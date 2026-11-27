import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/ui/BrandLogo";
import "./submitted.css";

export const metadata = { title: "Application received" };

const CONFETTI = Array.from({ length: 28 }, (_, i) => i);

/**
 * Full-screen thank-you shown right after an expert sends their
 * application for review (onboarding or the classic form). Only for an
 * application that is actually waiting for review; anything else goes to
 * the application page.
 */
export default async function ExpertSubmittedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/expert/application");

  const [{ data: expert }, { data: profile }] = await Promise.all([
    supabase.from("expert_profiles").select("application_status").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (expert?.application_status !== "submitted") redirect("/expert/application");

  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="pr xs" role="main">
      <div className="xs-confetti" aria-hidden="true">
        {CONFETTI.map((i) => (
          <span
            key={i}
            style={
              {
                "--i": i,
                "--dur": `${2600 + ((i * 370) % 1400)}ms`,
                "--delay": `${700 + ((i * 530) % 900)}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="xs-inner">
        <BrandLogo size={22} label="Pivotroom.Africa" className="xs-logo" />

        <svg className="xs-check" viewBox="0 0 96 96" aria-hidden="true">
          <circle className="xs-ring" cx="48" cy="48" r="44" />
          <path className="xs-tick" d="M29 49.5 42 62l26-27" />
        </svg>

        <h1 className="xs-title">
          Thank you{firstName ? `, ${firstName}` : ""}!
        </h1>
        <p className="xs-lead">Your application is in, and our team will read it personally.</p>

        <div className="xs-mail">
          <span className="ms" aria-hidden="true">
            mark_email_unread
          </span>
          <p>
            We&apos;ll email you at <strong>{user.email}</strong> as soon as it has been reviewed, usually within 2
            working days.
          </p>
        </div>

        <ol className="xs-steps">
          <li className="done">
            <span className="ms" aria-hidden="true">
              check
            </span>
            Application sent
          </li>
          <li>
            <span className="ms" aria-hidden="true">
              fact_check
            </span>
            Our team reviews it
          </li>
          <li>
            <span className="ms" aria-hidden="true">
              mail
            </span>
            You get an email
          </li>
          <li>
            <span className="ms" aria-hidden="true">
              rocket_launch
            </span>
            Your profile goes live
          </li>
        </ol>

        <div className="xs-acts">
          <Link href="/preview/my-profile?from=onboarding" className="xs-btn ink">
            Preview your profile
          </Link>
          <Link href="/" className="xs-btn line">
            Back to home
          </Link>
        </div>
        <Link href="/expert/application" className="xs-small">
          View your application
        </Link>
      </div>
    </div>
  );
}
