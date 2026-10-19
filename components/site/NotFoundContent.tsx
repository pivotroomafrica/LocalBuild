import Link from "next/link";

/** 404 (website design): rings, a plain message and the usual next steps. */
export function NotFoundContent() {
  return (
    <section className="offer" style={{ background: "#ffffff" }}>
      <div className="ring ring-l" aria-hidden="true" />
      <div className="ring ring-r" aria-hidden="true" />
      <div className="in" style={{ maxWidth: 960, paddingBlock: "clamp(72px, 10vw, 136px)" }}>
        <span className="d" aria-hidden="true" style={{ fontSize: "clamp(72px, 12vw, 160px)", lineHeight: 0.9, letterSpacing: "-0.04em", color: "#e4e6e9" }}>
          404
        </span>
        <h1 className="h1" style={{ fontSize: "clamp(32px, 4.4vw, 56px)" }}>
          This page has left the room.
        </h1>
        <p>
          The link may be old, or a letter may have slipped. The experts are all still here. Here is where people
          usually go next.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <Link href="/match" className="btn btn-ink lg">
            Find my match{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
          <Link href="/" className="btn btn-line lg even">
            Go to the home page
          </Link>
        </div>
        <nav className="quick" aria-label="Popular pages" style={{ marginBlockStart: 24 }}>
          {[
            { href: "/experts", label: "Find an expert" },
            { href: "/dashboard", label: "My sessions" },
            { href: "/become-an-expert", label: "Become an expert" },
            { href: "/help", label: "Help and FAQ" },
          ].map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
