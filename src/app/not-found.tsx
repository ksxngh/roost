import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <BrandMark href="/" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 text-center">
        <p className="text-muted-foreground text-sm font-medium">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          This page doesn&rsquo;t exist
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The page you&rsquo;re looking for may have moved, or the link was
          mistyped.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/browse">Browse services</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
