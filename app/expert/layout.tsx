import { WorkspaceShell } from "@/components/app/WorkspaceShell";

export default function ExpertLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell eyebrow="Expert workspace">{children}</WorkspaceShell>;
}
