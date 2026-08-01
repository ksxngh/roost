"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthDivider } from "@/components/auth/auth-divider";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      // One generic message for bad credentials: never disclose whether the
      // email exists.
      setFormError(
        error.status === 401
          ? "Incorrect email or password."
          : (error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue studying.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleEnabled ? (
          <>
            <GoogleButton label="Continue with Google" />
            <AuthDivider />
          </>
        ) : null}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            labelAside={
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            }
            {...register("password")}
          />
          {formError ? (
            <p role="alert" className="text-destructive text-sm">
              {formError}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="text-muted-foreground text-center text-sm">
          New to Roost?{" "}
          <Link
            href="/signup"
            className="text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
