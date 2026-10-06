"use client";

import { usePathname } from "next/navigation";
import { WorkspaceTabs } from "@/components/app/WorkspaceTabs";

const LINKS = [
  { href: "/admin/experts", label: "Experts" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/bookings", label: "Bookings" },
];

/** Admin section tabs -- rendered once by app/admin/layout.tsx, so the
 * active tab comes from the URL rather than a per-page prop. */
export function AdminNav() {
  const pathname = usePathname();
  const current = LINKS.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))?.href ?? "";
  return <WorkspaceTabs tabs={LINKS} current={current} label="Admin sections" />;
}
