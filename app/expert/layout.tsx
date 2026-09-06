import { DashboardHeader } from "@/components/layout/DashboardHeader";

export default function ExpertLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <DashboardHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
