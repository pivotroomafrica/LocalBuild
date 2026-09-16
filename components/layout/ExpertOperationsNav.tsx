import Link from "next/link";

/**
 * Nav for the expert OPERATIONAL area (spec section 20-23) -- deliberately
 * a separate component from ExpertApplicationNav, whose own "Sessions"
 * link goes to /expert/application/sessions (session PRICING config).
 * That name collision is exactly why this is a new component instead of
 * an added link on the existing one: "Sessions" here means booked
 * sessions, a completely different concept from pricing setup.
 */
const LINKS = [
  { href: "/expert/dashboard", label: "Dashboard" },
  { href: "/expert/sessions", label: "Sessions" },
  { href: "/expert/availability", label: "Availability" },
];

export function ExpertOperationsNav({ current }: { current: string }) {
  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
      {LINKS.map((link) => {
        const isActive = link.href === current;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
