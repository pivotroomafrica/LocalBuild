"use client";

import { useMemo, useState } from "react";
import { CONTACT_EMAIL } from "@/lib/legal/content";

type Faq = { cat: string; q: string; a: string };

/** Answers describe what the product does today. Refund timing is still a
 * company decision, marked [X] like the legal drafts. */
const FAQS: Faq[] = [
  ["Booking", "How does Find my match work?", "Describe what you are facing in a few lines. We read it against each published expert's experience and show you up to five people best placed to help, with the reason for each. You choose who to book."],
  ["Booking", "Can I book without being matched?", "Yes. Go to Find an expert, filter by topic, and open any profile to see prices, session lengths and open times."],
  ["Booking", "How far ahead can I book?", "From 24 hours ahead up to 90 days ahead. Experts open their own times, and every open time is shown on their profile."],
  ["Booking", "Can a colleague join my session?", "Sessions are booked one to one. If you would like someone to join, say so in what you write for the expert and ask whether they agree."],
  ["Payments", "How do I pay?", "Through Chapa, with telebirr, CBE Birr or a bank card, or by bank transfer, which our team verifies. You pay when you book, and your booking is confirmed once the payment is verified."],
  ["Payments", "Are there any extra fees?", "No. The price you see already includes 15% VAT. There is nothing else to pay."],
  ["Payments", "What about very large payments?", "Payments above ETB 300,000 are made by bank transfer and checked by our team before the booking is confirmed."],
  ["Payments", "How do refunds work?", "Cancel at least 24 hours before a session to get a refund. If the expert cancels or does not attend, you get a full refund, or a free rebooking if you prefer. Refunds go back to the payment method you used within [X] working days."],
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
  ["Experts", "When do experts get paid?", "After the session has taken place, normally within [X] working days, to a bank or mobile money account in the expert's name."],
].map(([cat, q, a]) => ({ cat, q, a }));

const CATEGORIES = ["All", "Booking", "Payments", "Sessions", "Account", "Experts"];

/** /help (website design): search, topic filter, collapsible answers. */
export function HelpClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const byText = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? FAQS.filter((faq) => `${faq.q} ${faq.a}`.toLowerCase().includes(term)) : FAQS;
  }, [query]);
  const items = category === "All" ? byText : byText.filter((faq) => faq.cat === category);

  return (
    <>
      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap stack" style={{ maxWidth: 1280, paddingBlock: "clamp(48px, 7vw, 88px)", gap: 16 }}>
          <span className="eyebrow">Help and FAQ</span>
          <h1 className="h1">Answers before you have to ask.</h1>
          <p className="lede">Booking, paying, meeting your expert and managing your account, in plain words.</p>
          <label className="matchbar" style={{ marginBlockStart: 8 }}>
            <span className="box">
              <span className="ms" aria-hidden="true">
                search
              </span>
              <span className="sr">Search the help pages</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search, for example refund or Google Meet"
              />
            </span>
          </label>
        </div>
      </section>
      <section style={{ background: "#ffffff" }}>
        <div className="wrap stack" style={{ maxWidth: 1280, paddingBlock: "40px 120px", gap: 32 }}>
          <div className="scroller" role="group" aria-label="Topics">
            {CATEGORIES.map((label) => {
              const count = label === "All" ? byText.length : byText.filter((faq) => faq.cat === label).length;
              return (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  aria-pressed={category === label}
                  onClick={() => setCategory(label)}
                >
                  {label}{" "}
                  <span className="muted num" style={{ fontSize: 13, marginInlineStart: 4 }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {items.length > 0 ? (
            <div className="faqs" style={{ maxWidth: 880 }}>
              {items.map((faq) => (
                <details key={faq.q} className="faq">
                  <summary>
                    <span className="stack" style={{ gap: 2, paddingBlock: 14 }}>
                      <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                        {faq.cat}
                      </span>
                      <span className="d" style={{ fontSize: 18 }}>
                        {faq.q}
                      </span>
                    </span>
                    <span className="ms chev" aria-hidden="true">
                      arrow_drop_down
                    </span>
                  </summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          ) : (
            <div className="stack" style={{ gap: 8, alignItems: "flex-start" }}>
              <span className="d" style={{ fontSize: 20 }}>
                No answers match &ldquo;{query}&rdquo;
              </span>
              <span className="muted">Try a shorter word, or write to us and a person will reply.</span>
              <button
                type="button"
                className="textbtn"
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Clear the search
              </button>
            </div>
          )}

          <div className="ink stuck">
            <div className="stack" style={{ gap: 4 }}>
              <span className="d" style={{ fontSize: 22, color: "#ffffff" }}>
                Still stuck?
              </span>
              <span style={{ color: "#9ba1aa" }}>Write to us. Include your booking reference if you have one.</span>
            </div>
            <a className="btn btn-white md" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
