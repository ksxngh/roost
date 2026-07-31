"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { signupSchema, type SignupInput } from "@/lib/validations/auth";

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupInput) {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (error) {
      setFormError(
        error.message ?? "Could not create your account. Please try again.",
      );
      return;
    }
    toast.success("Account created — check your inbox to verify your email.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Start turning your notes into study material.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleEnabled ? (
          <>
            <GoogleButton label="Sign up with Google" />
            <AuthDivider />
          </>
        ) : null}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            id="name"
            label="Name"
            autoComplete="name"
            placeholder="Alex Chen"
            error={errors.name?.message}
            {...register("name")}
          />
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
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
