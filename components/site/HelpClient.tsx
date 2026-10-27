"use client";

import { useMemo, useState } from "react";
import { CONTACT_EMAIL } from "@/lib/legal/content";

type Faq = { cat: string; q: string; a: string };

/** Answers describe what the product does today. Refund and payout
 * timings are left out until the company confirms them. */
const FAQS: Faq[] = [
  ["Booking", "How do I find the right expert?", "Go to Find an expert, search or filter by topic, format and price, and open any profile to see what they have done, their prices, session lengths and open times."],
  ["Booking", "How far ahead can I book?", "From 24 hours ahead up to 90 days ahead. Experts open their own times, and every open time is shown on their profile."],
  ["Booking", "Can a colleague join my session?", "Sessions are booked one to one. If you would like someone to join, say so in what you write for the expert and ask whether they agree."],
  ["Payments", "How do I pay?", "Through Chapa, with telebirr, CBE Birr or a bank card, or by bank transfer, which our team verifies. You pay when you book, and your booking is confirmed once the payment is verified."],
  ["Payments", "Are there any extra fees?", "No. The price you see already includes 15% VAT. There is nothing else to pay."],
  ["Payments", "What about very large payments?", "Payments above ETB 300,000 are made by bank transfer and checked by our team before the booking is confirmed."],
  ["Payments", "How do refunds work?", "Cancel at least 24 hours before a session to get a refund. If the expert cancels or does not attend, you get a full refund, or a free rebooking if you prefer. Refunds go back to the payment method you used, and we email you when yours has been sent."],
  ["Sessions", "Where is my Google Meet link?", "In your confirmation email and on the booking in your account."],
  ["Sessions", "Where do in-person sessions take place?", "In a public or business location agreed for the booking. If anything about the location makes you uncomfortable, tell us before the session."],
  ["Sessions", "What if the expert is late or does not show up?", "Wait ten minutes, then write to us. You will get a full refund or a free rebooking, your choice."],
  ["Sessions", "How do I reschedule?", "Open the booking in your account and choose Reschedule. You can do this yourself up to 24 hours before the start time."],
  ["Sessions", "Can I leave a review?", "Yes. Once a session has taken place, open it in your account and leave a review. It appears on the expert's profile with your first name and last initial."],
  ["Sessions", "Can I record my session?", "Only if the expert agrees at the start of the session."],
  ["Account", "How do I sign in?", "With your email address and password. If you forget your password, use Forgot password on the sign-in page and we will email you a reset link."],
  ["Account", "Who can see my details?", "The expert you book sees your name, your professional background and what you write for the session. Your phone number and email address are never shown to experts."],
  ["Account", "How do I delete my account?", `Write to ${CONTACT_EMAIL} from the email address on your account. Upcoming sessions are cancelled and refunded first.`],
  ["Experts", "How do I become an expert?", "Start on the Become an expert page. You fill in an application, our team reviews it, and your profile goes live once it is approved."],
  ["Experts", "How much does Pivotroom take?", "20% of the expert's price for each completed session. No listing fee and no subscription. VAT is added to the client's price, not taken from the expert's share."],
  ["Experts", "When do experts get paid?", "After the session has taken place, to a bank or mobile money account in the expert's name. We email you when each payout has been sent."],
].map(([cat, q, a]) => ({ cat, q, a }));

const CATEGORIES = ["All", "Booking", "Payments", "Sessions", "Account", "Experts"];

/** /help (website design): a light card on a dark stage, search, topic
 * filter and numbered questions that open one at a time. */
export function HelpClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState(0);

  const byText = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? FAQS.filter((faq) => `${faq.q} ${faq.a}`.toLowerCase().includes(term)) : FAQS;
  }, [query]);
  const items = category === "All" ? byText : byText.filter((faq) => faq.cat === category);

  return (
    <section className="hstage" aria-labelledby="help-title">
      <div className="hglow" aria-hidden="true" />
      <div className="hcard">
        <div className="hhead">
          <span className="hpill">
            <span className="num" style={{ color: "#9ba1aa" }}>
              {FAQS.length}
            </span>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: "#0d0f12" }} />
            Help and FAQ
          </span>
          <h1 id="help-title" className="d" style={{ margin: 0, fontSize: "clamp(34px, 5vw, 60px)", lineHeight: 1.04, letterSpacing: "-0.03em", textWrap: "balance" }}>
            Answers before you have to ask.
          </h1>
          <p className="muted" style={{ margin: 0, maxWidth: "46ch", fontSize: "clamp(15px, 1.3vw, 17px)" }}>
            Booking, paying, meeting your expert and managing your account, in plain words.
          </p>
          <label className="hsearch">
            <span className="ms" aria-hidden="true" style={{ fontSize: 22, color: "#5c616a" }}>
              search
            </span>
            <span className="sr">Search the help pages</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(0);
              }}
              placeholder="Search, for example refund or Google Meet"
            />
          </label>
          <div className="hcats" role="group" aria-label="Topics">
            {CATEGORIES.map((label) => {
              const count = label === "All" ? byText.length : byText.filter((faq) => faq.cat === label).length;
              return (
                <button
                  key={label}
                  type="button"
                  className="hcat"
                  aria-pressed={category === label}
                  onClick={() => {
                    setCategory(label);
                    setOpen(0);
                  }}
                >
                  {label} <span className="ct num">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {items.length > 0 ? (
          <div className="qlist">
            {items.map((faq, index) => {
              const isOpen = open === index;
              return (
                <div key={faq.q} className={isOpen ? "qi open" : "qi"}>
                  <button
                    type="button"
                    className="qrow"
                    aria-expanded={isOpen}
                    aria-controls={`qa-${index}`}
                    onClick={() => setOpen(isOpen ? -1 : index)}
                  >
                    <span className="qn num" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="qt">
                      <span className="qc">{faq.cat}</span>
                      <span className="qq">{faq.q}</span>
                    </span>
                    <span className="qb" aria-hidden="true">
                      <span className="ms" style={{ fontSize: 20 }}>
                        {isOpen ? "close" : "add"}
                      </span>
                    </span>
                  </button>
                  {isOpen ? (
                    <div id={`qa-${index}`} className="qa" role="region">
                      <p>{faq.a}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="stack"
            style={{ padding: 28, background: "rgba(255,255,255,.7)", borderRadius: 24, gap: 8, alignItems: "center", textAlign: "center" }}
          >
            <span className="d" style={{ fontSize: 20 }}>
              No answers match &ldquo;{query}&rdquo;
            </span>
            <span className="muted">Try a shorter word, or write to us and a person will reply.</span>
            <button
              type="button"
              className="textbtn"
              style={{ minHeight: 44, fontWeight: 500 }}
              onClick={() => {
                setQuery("");
                setCategory("All");
                setOpen(0);
              }}
            >
              Clear the search
            </button>
          </div>
        )}

        <div className="stack" style={{ gap: 6, alignItems: "center", textAlign: "center" }}>
          <span className="muted" style={{ fontSize: 15 }}>
            Have any other questions?
          </span>
          <a className="mailto" href={`mailto:${CONTACT_EMAIL}`}>
            Write to {CONTACT_EMAIL}{" "}
            <span className="mi" aria-hidden="true">
              <span className="ms af" style={{ fontSize: 14 }}>
                arrow_forward
              </span>
            </span>
          </a>
          <span style={{ color: "#9ba1aa", fontSize: 13 }}>Include your booking reference if you have one. A person replies.</span>
        </div>
      </div>
    </section>
  );
}
