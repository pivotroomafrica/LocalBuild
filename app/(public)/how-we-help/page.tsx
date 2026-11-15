import Link from "next/link";
import { HowShowcase } from "@/components/site/HowShowcase";
import { getCategoryNamesForRequest } from "@/lib/public/cached";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";

export const metadata = {
  title: "How we help — Pivotroom",
  description: "Expert calls, in-person meetings, finding the right expert, and clear pricing and payments.",
};

const STEPS = [
  { title: "Find the person who has done it", body: "Search by your problem and compare vetted experts' experience, prices and open times." },
  { title: "Book a time that suits you", body: "Pick a length from 15 to 90 minutes, online or in person, from 24 hours to 90 days ahead." },
  { title: "Pay securely", body: "With Chapa or by bank transfer. The price you see includes VAT." },
  { title: "Talk it through", body: "Meet on Google Meet or in person, then leave a review for the next client." },
];

/** "How we help": the ways Pivotroom helps, each with its own page. */
export default async function HowWeHelpPage() {
  const topics = await getCategoryNamesForRequest();

  return (
    <div className="hw-page">
      <RevealOnScroll />
      <section className="hw-hero">
        <div className="wrap stack hw-hero-in" style={{ gap: 18 }}>
          <span className="hw-kicker">How we help</span>
          <h1 className="hw-h1">Answers from people who have already solved it.</h1>
          <p className="hw-lead">
            Pivotroom connects you with vetted experts for one focused hour, online or in person, at a price you see
            up front.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href="/experts" className="btn btn-ink lg">
              Find an expert{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
            <Link href="/become-an-expert" className="btn btn-line lg">
              Become an expert
            </Link>
          </div>
        </div>
      </section>

      <HowShowcase topics={topics} />

      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap section split">
          <div className="stack" style={{ gap: 12 }} data-reveal="">
            <h2 className="h2">How a session works</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "44ch" }}>
              The same four steps for every expert, whether you meet online or in person.
            </p>
          </div>
          <ol className="steplist">
            {STEPS.map((step, index) => (
              <li key={step.title} data-reveal="" style={{ "--d": index } as React.CSSProperties}>
                <span className="muted num" style={{ fontSize: 14, fontWeight: 500 }}>
                  {String(index + 1).padStart(2, "0")}
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
    </div>
  );
}
