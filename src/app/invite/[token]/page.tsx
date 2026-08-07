import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInvite } from "@/components/team/accept-invite";
import { BrandMark } from "@/components/brand-mark";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInvitationByToken } from "@/server/businesses/team";
import { getSession } from "@/server/session";

export const metadata: Metadata = {
  title: "Team invitation",
  robots: { index: false, follow: false },
};

const ROLE_LABEL = {
  OWNER: "an owner",
  ADMIN: "an admin",
  MEMBER: "a team member",
} as const;

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invitation, session] = await Promise.all([
    getInvitationByToken(token),
    getSession(),
  ]);

  const problem = !invitation
    ? "This invitation link is not valid."
    : invitation.acceptedAt
      ? "This invitation has already been used."
      : invitation.expired
        ? "This invitation has expired. Ask for a new one."
        : null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <BrandMark />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {problem ? "Invitation" : `Join ${invitation!.business.name}`}
          </CardTitle>
          <CardDescription>
            {problem ??
              `You've been invited to join ${invitation!.business.name} as ${ROLE_LABEL[invitation!.role]}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {problem ? (
            <Link href="/" className="text-sm underline">
              Go to {"​"}the homepage
            </Link>
          ) : session ? (
            <AcceptInvite
              token={token}
              // The signed-in email must match the invite; the server enforces
              // this, and the page says so up front to save a failed attempt.
              emailMatches={
                session.user.email.toLowerCase() === invitation!.email
              }
              invitedEmail={invitation!.email}
              signedInEmail={session.user.email}
            />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Sign in or create an account with{" "}
                <strong>{invitation!.email}</strong> to accept.
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="bg-primary text-primary-foreground rounded-md px-3 py-1.5"
                >
                  Sign in
                </Link>
                <Link
                  href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="rounded-md border px-3 py-1.5"
                >
                  Create account
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
