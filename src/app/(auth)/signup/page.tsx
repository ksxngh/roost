import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { googleAuthEnabled } from "@/server/auth";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }
  return <SignupForm googleEnabled={googleAuthEnabled} />;
}
