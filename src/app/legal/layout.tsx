import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/marketing/site-footer";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";

/**
 * Shell for the legal pages (Terms, Privacy). A plain reading layout: brand
 * header, a narrow prose column, and the shared footer. The prose styles live
 * here so both documents render identically.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <BrandMark href="/" />
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
        <article
          className={[
            "mx-auto w-full max-w-3xl px-4 py-12",
            // Prose styling without the typography plugin.
            "[&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight",
            "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold",
            "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold",
            "[&_p]:text-muted-foreground [&_p]:mb-4 [&_p]:leading-relaxed",
            "[&_ul]:text-muted-foreground [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:leading-relaxed",
            "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2",
            "[&_strong]:text-foreground",
          ].join(" ")}
        >
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
