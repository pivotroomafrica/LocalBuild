import { WorkspaceTabs } from "@/components/app/WorkspaceTabs";

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
  return <WorkspaceTabs tabs={LINKS} current={current} label="Expert workspace sections" />;
}
