import Link from "next/link";

const LINKS = [
  { href: "/expert/application", label: "Overview" },
  { href: "/expert/application/profile", label: "Profile" },
  { href: "/expert/application/expertise", label: "Expertise" },
  { href: "/expert/application/sessions", label: "Sessions" },
];

export function ExpertApplicationNav({ current }: { current: string }) {
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
