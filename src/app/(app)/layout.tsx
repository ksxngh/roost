import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/server/session";

/** Everything inside this group requires an authenticated session. */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireSession();
  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image }}>
      {children}
    </AppShell>
  );
}
