import { WorkspaceShell } from "@/components/app/WorkspaceShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell area="client">{children}</WorkspaceShell>;
}
