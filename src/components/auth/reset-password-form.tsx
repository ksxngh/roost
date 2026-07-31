"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validations/auth";

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid reset link</CardTitle>
          <CardDescription>
            This link is missing its token or has already been used. Request a
            new one below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    if (error) {
      setFormError(
        error.message ??
          "This reset link is invalid or expired. Request a new one.",
      );
      return;
    }
    toast.success("Password updated — sign in with your new password.");
    router.push("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>
          Your new password must be at least 10 characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          {formError ? (
            <p role="alert" className="text-destructive text-sm">
              {formError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
