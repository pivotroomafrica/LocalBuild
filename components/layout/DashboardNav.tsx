import { WorkspaceTabs } from "@/components/app/WorkspaceTabs";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/sessions", label: "My Sessions" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/profile", label: "Profile" },
];

export function DashboardNav({ current }: { current: string }) {
  return <WorkspaceTabs tabs={LINKS} current={current} label="Dashboard sections" />;
}
