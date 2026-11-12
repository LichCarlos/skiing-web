import { ManagementGuard } from "@/features/auth/management-guard";
import { ManagementShell } from "@/features/auth/management-shell";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ManagementGuard>
      <ManagementShell>{children}</ManagementShell>
    </ManagementGuard>
  );
}
