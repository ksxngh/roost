import { AppShell } from "@/components/shell/app-shell";

// Authentication is wired in Milestone 2; this layout will then verify the
// session server-side and redirect signed-out visitors to /login.
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
