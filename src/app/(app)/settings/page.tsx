import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronRight, CircleAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { settingsSections } from "@/lib/site-config";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = await requireSession();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Profile, appearance, notifications, and subscription."
      />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your profile information.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="mt-1 font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-1 flex items-center gap-2 font-medium">
                {user.email}
                {user.emailVerified ? (
                  <span className="text-success inline-flex items-center gap-1 text-xs">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <span className="text-warning inline-flex items-center gap-1 text-xs">
                    <CircleAlert className="size-3.5" aria-hidden="true" />
                    Unverified — check your inbox
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <ul className="space-y-3">
        {settingsSections.map((section) => (
          <li key={section.href}>
            <Link href={section.href} className="block">
              <Card className="hover:border-foreground/20 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    {section.title}
                    <ChevronRight
                      className="text-muted-foreground size-4"
                      aria-hidden
                    />
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Theme can be switched from the toggle in the top bar. Notification
            and subscription settings arrive with the subscription system.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
