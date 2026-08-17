import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { siteConfig } from "@/lib/site-config";

const LINKS: { heading: string; items: { label: string; href: string }[] }[] = [
  {
    heading: "Homeowners",
    items: [
      { label: "Browse services", href: "/browse" },
      { label: "How it works", href: "/#how-it-works" },
    ],
  },
  {
    heading: "Businesses",
    items: [
      { label: "List your business", href: "/signup" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Contact", href: `mailto:${siteConfig.supportEmail}` },
    ],
  },
];

/**
 * Shared footer for the public marketing surfaces. Carries the legal links a
 * marketplace must expose — Terms and Privacy — plus the two audiences' entry
 * points, so every public page ends with somewhere to go and the trust pages
 * are always one click away.
 */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="space-y-3">
            <BrandMark />
            <p className="text-muted-foreground max-w-xs text-sm">
              {siteConfig.description}
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-3"
          >
            {LINKS.map((group) => (
              <div key={group.heading} className="space-y-3">
                <h2 className="text-foreground text-sm font-medium">
                  {group.heading}
                </h2>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="text-muted-foreground mt-10 border-t pt-6 text-xs">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
