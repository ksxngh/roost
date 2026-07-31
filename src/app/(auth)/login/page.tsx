import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { googleAuthEnabled } from "@/server/auth";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }
  return <LoginForm googleEnabled={googleAuthEnabled} />;
}
