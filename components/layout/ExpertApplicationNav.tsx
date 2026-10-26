import Link from "next/link";

const STEPS = [
  { href: "/expert/application/profile", label: "1. Who you are" },
  { href: "/expert/application/expertise", label: "2. What you've solved" },
  { href: "/expert/application/sessions", label: "3. Sessions and hours" },
  { href: "/expert/application", label: "Review and submit" },
];

/** The application's step bar: steps before the current one are filled in. */
export function ExpertApplicationNav({ current }: { current: string }) {
  const at = STEPS.findIndex((step) => step.href === current);
  return (
    <nav aria-label="Application steps" className="oq-steps">
      {STEPS.map((step, index) => (
        <Link
          key={step.href}
          href={step.href}
          aria-current={index === at ? "step" : undefined}
          className={index === at ? "oq-step on" : at >= 0 && index < at ? "oq-step done" : "oq-step"}
        >
          {step.label}
        </Link>
      ))}
    </nav>
  );
}
