import { AppHeader } from "@/components/app/AppHeader";

/**
 * Layout frame for every signed-in workspace (customer dashboard, expert
 * area, admin): the dark intro header, a warm beige canvas, and a soft
 * intro-style glow band behind the top of the content.
 */
export function WorkspaceShell({
  children,
  width = "default",
  eyebrow,
  before,
}: {
  children: React.ReactNode;
  width?: "default" | "wide";
  /** Small uppercase workspace label above the page content. */
  eyebrow?: string;
  /** Rendered above children inside the content column (e.g. section tabs). */
  before?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <AppHeader />
      <div className="relative flex-1">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(243,239,230,0.95),rgba(251,249,245,0))]"
        />
        <main
          className={`relative mx-auto w-full flex-1 px-5 pb-20 pt-10 sm:px-8 ${width === "wide" ? "max-w-6xl" : "max-w-4xl"}`}
        >
          {eyebrow ? (
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              {eyebrow}
            </p>
          ) : null}
          {before}
          {children}
        </main>
      </div>
    </div>
  );
}
