export const metadata = { title: "Contact — Pivotroom" };

const MAILBOXES = [
  {
    icon: "chat_bubble",
    label: "General questions",
    use: "Bookings and sessions, payments and refunds, expert applications and payouts, privacy and data requests, or anything else.",
    addr: "hello@pivotroom.africa",
  },
  {
    icon: "handshake",
    label: "Partnerships",
    use: "Accelerators, banks, programmes and companies that want to work with us.",
    addr: "partners@pivotroom.africa",
  },
  {
    icon: "mic",
    label: "Press and media",
    use: "Interviews, podcasts, features and brand assets.",
    addr: "press@pivotroom.africa",
  },
];

export default function ContactPage() {
  return (
    <>
      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap stack" style={{ maxWidth: 1280, paddingBlock: "clamp(48px, 7vw, 88px)", gap: 16 }}>
          <span className="eyebrow">Contact</span>
          <h1 className="h1">Write to the right desk and get a faster answer.</h1>
          <p className="lede">
            Each address below goes to the people who handle that subject. If you have a booking, include its
            reference, for example PR-8F7K2A.
          </p>
        </div>
      </section>
      <section style={{ background: "#ffffff" }}>
        <div className="wrap" style={{ maxWidth: 1280, paddingBlock: "48px 128px" }}>
          <div className="mails">
            {MAILBOXES.map((box) => (
              <a key={box.addr} className="mail" href={`mailto:${box.addr}`}>
                <span className="circle-icon" aria-hidden="true">
                  <span className="ms" style={{ fontSize: 24 }}>
                    {box.icon}
                  </span>
                </span>
                <span className="stack" style={{ gap: 6 }}>
                  <span className="d" style={{ fontSize: 20, color: "#0d0f12" }}>
                    {box.label}
                  </span>
                  <span className="muted" style={{ fontSize: 15 }}>
                    {box.use}
                  </span>
                  <span className="addr">{box.addr}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
