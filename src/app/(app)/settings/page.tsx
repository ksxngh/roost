import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Settings"
        description="Profile, appearance, notifications, and subscription."
      />
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Theme can be switched from the toggle in the top bar. Account,
            notification, and billing settings arrive with authentication and
            the subscription system.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
