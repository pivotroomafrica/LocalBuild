/**
 * Terms of service, privacy policy and expert terms.
 *
 * DRAFT, NOT LEGAL ADVICE. Adapted from the website design's draft text to
 * match how Pivotroom actually works today (email sign-in, VAT added to
 * the expert's price, 20% commission, 24-hour self-service cutoff, bank
 * transfer for large payments). Specific timings (refund and payout days)
 * and the company registration number are left out until confirmed; add
 * them here when decided. Have a lawyer review all three documents, then
 * set LEGAL_REVIEWED to true.
 */
export const LEGAL_REVIEWED = false;
export const LEGAL_LAST_UPDATED = "27 October 2026";
export const LEGAL_EFFECTIVE = "27 October 2026";

export type LegalDocKey = "terms" | "privacy" | "expert";

export type LegalDoc = {
  key: LegalDocKey;
  href: string;
  label: string;
  title: string;
  intro: string;
  short: string[];
  sections: { title: string; id?: string; paras: string[] }[];
};

const CONTACT_EMAIL = "hello@pivotroom.africa";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    key: "terms",
    href: "/terms",
    label: "Terms of service",
    title: "Terms of service",
    intro: "The agreement between you and Pivotroom when you find, book and meet experts on the site.",
    short: [
      "You must be 18 or older, and your account is yours alone.",
      "You see the full price, VAT included, before you book, and you pay when you book.",
      "Cancel or reschedule yourself up to 24 hours before. If the expert cancels, you get your money back.",
      "Experts are independent. We vet them, but their advice is their own.",
    ],
    sections: [
      {
        title: "Who we are",
        paras: [
          "Pivotroom is a service operated by Modern Ethiopia Marketing PLC, a company registered in Ethiopia, with its office in Addis Ababa (we, us, Pivotroom).",
          "These terms apply when you use pivotroom.africa to find, book and meet experts. If you offer sessions as an expert, the Expert terms apply to you as well.",
        ],
      },
      {
        title: "Your account",
        paras: [
          "You must be at least 18 years old to create an account. Give us accurate information and keep it up to date.",
          "You sign in with your email address and a password. You are responsible for what happens under your account, so keep your password to yourself.",
          "One person, one account. Accounts may not be sold or transferred.",
        ],
      },
      {
        title: "What Pivotroom does, and does not do",
        paras: [
          "Pivotroom connects you with independent experts and lets you book paid one-to-one sessions with them. Experts are not our employees, and the advice they give is their own.",
          "We review every expert's application before they are listed. We do not guarantee the outcome of any session or any decision you make after it.",
          "Sessions are for guidance. Unless an expert states that they are acting in a licensed professional capacity, a session is not a substitute for formal legal, financial, tax or medical services.",
        ],
      },
      {
        title: "Booking and payment",
        paras: [
          "Each expert's price, session length and format are shown before you book. Prices are in Ethiopian birr and include 15% VAT, which is added to the expert's price.",
          "When you pick a time we reserve it for you for a short period while you complete your details and pay. You pay the full price through our payment partner Chapa, or by bank transfer, which our team verifies. Payments above ETB 300,000 are made by bank transfer only.",
          "Your booking is confirmed once the payment is verified. We hold the payment until the session has taken place, then pay the expert.",
        ],
      },
      {
        title: "Rescheduling, cancellations and refunds",
        paras: [
          "You can reschedule or cancel a confirmed booking yourself from your account up to 24 hours before it starts.",
          "If you cancel at least 24 hours before, you are refunded the amount you paid. Within 24 hours of the start time, or if you do not attend, the session is not refunded, because the expert has kept that time for you.",
          "If the expert cancels, does not attend, or the session cannot take place because of a problem on our side, you receive a full refund or a free rebooking, your choice.",
          "Refunds are returned to the payment method you used. We tell you by email when your refund has been sent.",
        ],
      },
      {
        title: "During the session",
        paras: [
          "Sessions take place on Google Meet or in person, as shown when you book. Arrive on time; a session that starts late still ends at the scheduled time.",
          "Treat the expert with respect. Do not record a session unless the expert agrees at the start.",
          "In-person sessions should take place in a public or business setting. Tell us straight away if anything makes you feel unsafe.",
        ],
      },
      {
        title: "Keeping bookings on Pivotroom",
        paras: [
          "If you meet an expert through Pivotroom, book further paid sessions with them through Pivotroom for [12] months after your first session. This is how we keep the platform running and keep both sides protected.",
        ],
      },
      {
        title: "Reviews",
        paras: [
          "After a session has taken place you may leave one review of it. It must describe your own experience honestly. We may hide reviews that are false, abusive, or share someone else's private information.",
        ],
      },
      {
        title: "Acceptable use",
        paras: [
          "Do not use Pivotroom to harass anyone, to impersonate someone, to collect data about other users, to copy or scrape the site, or for anything unlawful.",
        ],
      },
      {
        title: "Content and intellectual property",
        paras: [
          "The Pivotroom name, logo, design and site content belong to us. What an expert shares in a session remains theirs; you may use their advice for your own purposes, but not resell or publish it as your own material without their permission.",
        ],
      },
      {
        title: "Our liability",
        paras: [
          "To the extent the law allows, our total liability to you for any claim related to a session is limited to the amount you paid for that session.",
          "We are not liable for business decisions you make based on what an expert tells you. Nothing in these terms limits liability that cannot be limited under Ethiopian law.",
        ],
      },
      {
        title: "Suspending or closing an account",
        paras: [
          `You can ask us to close your account at any time by writing to ${CONTACT_EMAIL}. We may suspend or close an account that breaks these terms, after telling you why, unless the law or the safety of others prevents us from doing so.`,
        ],
      },
      {
        title: "Changes to these terms",
        paras: [
          "We may update these terms. If a change matters, we will tell you by email at least [14] days before it takes effect. Bookings made before a change follow the terms in place when you booked.",
        ],
      },
      {
        title: "Law and disputes",
        paras: [
          "These terms are governed by the laws of the Federal Democratic Republic of Ethiopia. If something goes wrong, write to us first and we will try to resolve it within [14] days. If we cannot, disputes will be settled by the competent courts in Addis Ababa.",
        ],
      },
    ],
  },
  {
    key: "privacy",
    href: "/privacy",
    label: "Privacy policy",
    title: "Privacy policy",
    intro: "What we collect when you use Pivotroom, why we collect it, who sees it, and how to control it.",
    short: [
      "We collect what we need to run bookings and payments.",
      "Chapa handles your payment details. We never see your card number or wallet PIN.",
      "Experts see your name and what you wrote for the session, never your phone number or email.",
      "We do not sell your data. You can ask to see, change or delete it at any time.",
    ],
    sections: [
      {
        title: "Who is responsible for your data",
        paras: [
          "Pivotroom is operated by Modern Ethiopia Marketing PLC, Addis Ababa (we, us). We decide how your personal data is used on pivotroom.africa and we are responsible for it.",
          "This policy covers clients, experts and anyone who visits the site. It follows applicable Ethiopian data protection law.",
        ],
      },
      {
        title: "What we collect",
        paras: [
          "Account details: your name, phone number and email address.",
          "Profile details you add: your current role, employment type, industry and years of experience. Experts also add a photo and a description of their background.",
          "Booking details: the sessions you book, what you write for the expert before a session, reschedules, cancellations and reviews.",
          "Payment details: when you pay through Chapa, Chapa processes the payment and we receive the amount, a reference and the status. If you pay by bank transfer, we keep the receipt you upload so our team can verify it. We never see or store your card number or wallet PIN.",
          "Technical details: your device, browser and network address, and cookies needed to keep you signed in.",
        ],
      },
      {
        title: "How we use it",
        paras: [
          "To run your account, take bookings and payments, send Google Meet links and confirmations, and handle refunds.",
          "To keep Pivotroom safe: reviewing experts, preventing fraud and enforcing our terms.",
          "To improve the service, using aggregated information wherever possible.",
        ],
      },
      {
        title: "Who we share it with",
        paras: [
          "The expert you book sees your name, your professional background, what you wrote for the session, and the session details. Your phone number and email address are not shown to them.",
          "Service providers who help us run Pivotroom: Supabase for our database and file storage, Chapa for payments, Google for Meet and calendar invitations, Resend for email, and our hosting provider. They may use your data only to provide their service to us.",
          "Authorities, when Ethiopian law requires it.",
          "We do not sell your personal data, and we do not share it with advertisers.",
        ],
      },
      {
        title: "Data stored outside Ethiopia",
        paras: [
          "Some of our providers store or process data outside Ethiopia. When they do, we use providers with recognised security standards and contracts that protect your data.",
        ],
      },
      {
        title: "How long we keep it",
        paras: [
          "We keep your account data while your account is open. If you close it, we delete or anonymise your personal data without undue delay, except payment and tax records, which we keep for as long as the law requires.",
        ],
      },
      {
        title: "How we protect it",
        paras: [
          "Data is encrypted in transit, and access to each record is limited to the people who need it. No system is perfectly secure; if a breach affects you, we will tell you and the relevant authority as the law requires.",
        ],
      },
      {
        title: "Your rights",
        paras: [
          "You can ask to see the data we hold about you, correct it, delete it, receive a copy of it, or object to how we use it. You can also withdraw any consent you have given.",
          `Most details can be changed directly in your account. For anything else, write to ${CONTACT_EMAIL} and we will reply within [30] days.`,
        ],
      },
      {
        title: "Cookies",
        paras: [
          "We use cookies that are needed to keep you signed in and the site working. You can block cookies in your browser; signing in and booking will then stop working.",
        ],
      },
      {
        title: "Age limit",
        paras: ["Pivotroom is for people aged 18 and over. We do not knowingly collect data from anyone younger."],
      },
      {
        title: "Changes to this policy",
        paras: [
          "If we change this policy in a way that matters, we will tell you by email before the change takes effect.",
        ],
      },
    ],
  },
  {
    key: "expert",
    href: "/expert-terms",
    label: "Expert terms",
    title: "Expert terms",
    intro: "The agreement between you and Pivotroom when you offer paid sessions as an expert.",
    short: [
      "You set your rate and your hours. Clients can only book slots you open.",
      "We keep 20% of your price. VAT is added to the client's price, not taken from yours.",
      "Clients pay before the session. You are paid after it takes place.",
      "Inside 24 hours clients can't cancel themselves. If you cancel, the client is refunded.",
    ],
    sections: [
      {
        title: "Who these terms apply to",
        paras: [
          "These terms apply to anyone who offers paid sessions on Pivotroom (you, the expert). They sit alongside our Terms of service and Privacy policy. Pivotroom is operated by Modern Ethiopia Marketing PLC, Addis Ababa (we, us).",
        ],
      },
      {
        title: "Applying and review",
        paras: [
          "You apply by completing the expert application. Our team then reviews who you are and the track record you describe, and may contact you to confirm it.",
          "We may decline an application, or ask for changes, at our discretion. Being listed is not guaranteed.",
        ],
      },
      {
        title: "Your profile",
        paras: [
          "Everything on your profile must be true and current. Nothing is published until we approve it, and you can preview it at any time.",
          "You give us permission to show your name, photo, profile and reviews on Pivotroom and in our marketing about Pivotroom, for as long as you are listed.",
        ],
      },
      {
        title: "Your status",
        paras: [
          "You are an independent professional, not an employee or agent of Pivotroom. You decide what advice to give and how to give it.",
          "If your field is regulated, such as law, accounting or medicine, you are responsible for holding any licence it requires and for following your professional rules.",
        ],
      },
      {
        title: "Rates and availability",
        paras: [
          "You set your own rate and the session lengths you offer, and you choose which times to open. Clients can book only times you have opened.",
          "Once a client books a time, you have committed to it. Keep your availability up to date.",
        ],
      },
      {
        title: "Commission, VAT and taxes",
        id: "payouts",
        paras: [
          "We keep 20% of your price for each completed session. There is no listing fee and no subscription.",
          "15% VAT is added on top of your price and paid by the client; it is never taken from your share. We deduct other taxes from your share only where Ethiopian law requires us to, and show you every deduction. You remain responsible for your own tax registration and filings.",
        ],
      },
      {
        title: "Getting paid",
        paras: [
          "The client pays in full before the booking is confirmed. We hold the payment until the session has taken place.",
          "After the session, your 80%, less any tax we are required to deduct, is paid to the bank or mobile money account registered in your name. We tell you by email when each payout has been sent.",
        ],
      },
      {
        title: "Cancellations and no-shows",
        paras: [
          "Clients can cancel or reschedule themselves only until 24 hours before a session. If a client does not attend, you are paid your share as if the session had taken place.",
          "If you cancel, or do not attend, the client is refunded in full and you are not paid. Repeated cancellations may lead us to pause your profile.",
          "If you must cancel, tell us as early as possible so the client can rebook.",
        ],
      },
      {
        title: "How you work with clients",
        paras: [
          "Be on time, prepared and professional. Read what the client wrote before the session.",
          "Keep what clients tell you confidential, and do not use it for any purpose other than the session.",
          "Do not record a session unless the client agrees at the start.",
          "For [12] months after you first meet a client through Pivotroom, book any further paid sessions with them through Pivotroom.",
        ],
      },
      {
        title: "Reviews",
        paras: [
          "Clients may review you after each session that has taken place. We hide reviews only if they are false, abusive, or break our terms, not because they are critical.",
        ],
      },
      {
        title: "Pausing or leaving",
        paras: [
          "You can ask us to pause your profile or close your account at any time. Sessions already booked must be honoured or cancelled with a full refund to the client. Money owed to you is still paid out.",
        ],
      },
      {
        title: "Our liability",
        paras: [
          "To the extent the law allows, we are not responsible for the content of the advice you give or for what a client does with it. Our total liability to you is limited to the payouts owed to you.",
        ],
      },
      {
        title: "Changes to these terms",
        paras: ["We may update these terms. If a change matters, we will tell you by email at least [30] days before it takes effect."],
      },
      {
        title: "Law and disputes",
        paras: [
          "These terms are governed by the laws of the Federal Democratic Republic of Ethiopia. We will try to resolve any disagreement with you directly first. If we cannot, disputes will be settled by the competent courts in Addis Ababa.",
        ],
      },
    ],
  },
];

export function legalDoc(key: LegalDocKey): LegalDoc {
  return LEGAL_DOCS.find((doc) => doc.key === key)!;
}

export { CONTACT_EMAIL };
