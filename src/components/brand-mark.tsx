import Link from "next/link";
import { House } from "lucide-react";

import { siteConfig } from "@/lib/site-config";

function BrandGlyph() {
  return (
    <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
      <House className="size-4" aria-hidden="true" />
    </span>
  );
}

/**
 * Product wordmark. Renders as a link when `href` is given (app shell) and as
 * a plain element otherwise (marketing header, where the page is the target).
 */
export function BrandMark({ href }: { href?: string }) {
  const content = (
    <>
      <BrandGlyph />
      {siteConfig.name}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="focus-visible:ring-ring flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
      >
        {content}
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      {content}
    </span>
  );
}
