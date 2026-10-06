import { WorkspaceShell } from "@/components/app/WorkspaceShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell eyebrow="My Pivotroom">{children}</WorkspaceShell>;
}
