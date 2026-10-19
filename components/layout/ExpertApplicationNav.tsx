import { WorkspaceTabs } from "@/components/app/WorkspaceTabs";

const LINKS = [
  { href: "/expert/application", label: "Overview" },
  { href: "/expert/application/profile", label: "Profile" },
  { href: "/expert/application/expertise", label: "Expertise" },
  { href: "/expert/application/sessions", label: "Session pricing" },
];

export function ExpertApplicationNav({ current }: { current: string }) {
  return <WorkspaceTabs tabs={LINKS} current={current} label="Application sections" />;
}
