/**
 * "How we help" pages. Every statement here reflects how Pivotroom works
 * today (booking rules in types/booking.ts and the booking functions,
 * payments, the Help page); keep them in step when those change.
 */
export type HowPage = {
  slug: string;
  title: string;
  lead: string;
  image: string;
  /** Short facts shown as tiles under the intro. */
  facts: { value: string; label: string }[];
  points: { icon: string; title: string; body: string }[];
  steps: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
  cta: { label: string; href: string };
};

export const HOW_PAGES: HowPage[] = [
  {
    slug: "expert-calls",
    title: "Expert calls",
    lead: "A one-to-one video call on Google Meet with someone who has already done what you're about to do.",
    image: "/images/how-1.svg",
    facts: [
      { value: "15–90", label: "minutes, you choose" },
      { value: "1:1", label: "just you and the expert" },
      { value: "24h", label: "to reschedule yourself" },
    ],
    points: [
      { icon: "schedule", title: "The length that fits", body: "Choose 15, 30, 45, 60 or 90 minutes, from the lengths each expert offers." },
      { icon: "videocam", title: "Google Meet, ready to go", body: "Your Meet link and a calendar invite arrive by email and stay on the booking in your account." },
      { icon: "edit_note", title: "An expert who has prepared", body: "When you book, you write what you want to discuss, so the expert comes ready for your question." },
      { icon: "public", title: "On your own clock", body: "Open times are shown in your time zone, wherever you are booking from." },
    ],
    steps: [
      { title: "Find your expert", body: "Search by what you're working on and open a profile to see their experience, prices and open times." },
      { title: "Pick a length and a time", body: "Times run from 24 hours to 90 days ahead, as the expert has opened them." },
      { title: "Pay to confirm", body: "Pay with Chapa (telebirr, CBE Birr or card) or by bank transfer. The booking is confirmed once payment is verified." },
      { title: "Join the call", body: "Open the Meet link at the start time. Afterwards you can leave a review." },
    ],
    faqs: [
      { q: "Where is my Google Meet link?", a: "In your confirmation email and on the booking in your account." },
      { q: "Can a colleague join my call?", a: "Calls are booked one to one. If you'd like someone to join, say so in what you write for the expert and ask whether they agree." },
      { q: "Can I record the call?", a: "Only if the expert agrees at the start of the session." },
    ],
    cta: { label: "Find an expert for a call", href: "/experts" },
  },
  {
    slug: "in-person-meetings",
    title: "In-person meetings",
    lead: "Some conversations go better across a table. Many experts also meet clients face to face.",
    image: "/images/how-4.svg",
    facts: [
      { value: "15–90", label: "minutes, you choose" },
      { value: "Same", label: "prices and booking as calls" },
      { value: "Full", label: "refund if the expert doesn't come" },
    ],
    points: [
      { icon: "person_pin_circle", title: "Experts who meet in person", body: "Filter the directory by format to see experts who offer in-person sessions." },
      { icon: "storefront", title: "A suitable place", body: "Sessions take place in a public or business location agreed for the booking." },
      { icon: "event_available", title: "Booked like any session", body: "Pick the in-person option, a length and a time, and pay to confirm. The same rules apply." },
      { icon: "support_agent", title: "We're here if something feels off", body: "If anything about the location makes you uncomfortable, tell us before the session." },
    ],
    steps: [
      { title: "Choose an expert who meets in person", body: "Use the format filter, then open their profile." },
      { title: "Book the in-person option", body: "Pick a length and a time, and tell the expert what you want to discuss." },
      { title: "Pay to confirm", body: "With Chapa or by bank transfer. You'll get a confirmation email." },
      { title: "Meet and talk it through", body: "Afterwards you can leave a review on the expert's profile." },
    ],
    faqs: [
      { q: "Where do in-person sessions take place?", a: "In a public or business location agreed for the booking." },
      { q: "What if the expert is late or doesn't show up?", a: "Wait ten minutes, then write to us. You get a full refund or a free rebooking, your choice." },
      { q: "Can I change the time?", a: "Yes. Open the booking in your account and choose Reschedule, up to 24 hours before the start time." },
    ],
    cta: { label: "Find an expert to meet", href: "/experts" },
  },
  {
    slug: "finding-the-right-expert",
    title: "Finding the right expert",
    lead: "Every expert on Pivotroom has been reviewed by our team. Here's how to find the one who has solved your problem.",
    image: "/images/how-2.svg",
    facts: [
      { value: "Vetted", label: "every expert is reviewed" },
      { value: "Up front", label: "prices on every card" },
      { value: "Real", label: "reviews from completed sessions" },
    ],
    points: [
      { icon: "search", title: "Search by your problem", body: "Describe what you're working on, such as exporting, a bank loan or hiring, and see who has done it." },
      { icon: "tune", title: "Filter what matters", body: "Narrow by topic, by online or in person, and by price." },
      { icon: "badge", title: "Profiles that show the work", body: "See each expert's experience, the problems they help with, their session lengths, prices and open times." },
      { icon: "reviews", title: "Reviews you can trust", body: "Only clients whose session took place can review. Experts who earn it get a Top expert badge." },
    ],
    steps: [
      { title: "Start with your question", body: "Search for the problem, not the job title." },
      { title: "Compare a few profiles", body: "Look at what they've done, who they help and what clients say." },
      { title: "Check the fit", body: "Look at their languages, whether they meet online or in person, and their open times." },
      { title: "Book the time you need", body: "Short calls suit a quick question; longer ones suit a plan or a review." },
    ],
    faqs: [
      { q: "How are experts checked?", a: "Experts apply with their background and the problems they've solved. Our team reviews every application before a profile goes live." },
      { q: "What does the Top expert badge mean?", a: "It is earned, never bought: at least 3 completed sessions, at least 2 client reviews and an average rating of 4.5 or higher." },
      { q: "Who sees my details?", a: "The expert you book sees your name, your professional background and what you write for the session. Never your phone number or email." },
    ],
    cta: { label: "Browse experts", href: "/experts" },
  },
  {
    slug: "pricing-and-payments",
    title: "Pricing and payments",
    lead: "The price on the profile is the price you pay. Here's how paying, receipts and refunds work.",
    image: "/images/how-3.svg",
    facts: [
      { value: "15%", label: "VAT included in every price" },
      { value: "No", label: "extra fees" },
      { value: "24h", label: "to cancel for a refund" },
    ],
    points: [
      { icon: "sell", title: "Experts set their price", body: "Each expert sets their rate. Prices are shown with 15% VAT already included." },
      { icon: "account_balance_wallet", title: "Pay your way", body: "Pay through Chapa with telebirr, CBE Birr or a bank card, or by bank transfer, which our team verifies." },
      { icon: "receipt_long", title: "Receipts on request", body: "After paying, ask for a receipt from your session page. We email you when it's ready to download." },
      { icon: "currency_exchange", title: "Fair refunds", body: "Cancel at least 24 hours ahead for a refund. If the expert cancels or doesn't attend, you get a full refund or a free rebooking." },
    ],
    steps: [
      { title: "See the full price", body: "Each session length shows its price, VAT included." },
      { title: "Choose how to pay", body: "Chapa confirms straight away once verified; bank transfers are checked by our team." },
      { title: "Get your confirmation", body: "Your booking is confirmed once the payment is verified." },
      { title: "Ask for a receipt", body: "From the session page, whenever you need one." },
    ],
    faqs: [
      { q: "Are there any extra fees?", a: "No. The price you see already includes 15% VAT. There is nothing else to pay." },
      { q: "What about very large payments?", a: "Payments above ETB 300,000 are made by bank transfer and checked by our team before the booking is confirmed." },
      { q: "How do refunds work?", a: "Refunds go back to the payment method you used, and we email you when yours has been sent." },
    ],
    cta: { label: "Find an expert", href: "/experts" },
  },
];

export function getHowPage(slug: string) {
  return HOW_PAGES.find((page) => page.slug === slug) ?? null;
}
