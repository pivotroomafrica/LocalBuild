import { PublicHeader } from "@/components/layout/PublicHeader";

/** Route group -- (public) is stripped from the URL, so this wraps `/`,
 * `/experts`, `/experts/[slug]`, and `/become-an-expert` with the
 * auth-aware header, without affecting /dashboard, /expert, /admin,
 * /auth, /book, or /booking, each of which has its own layout already. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <PublicHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
