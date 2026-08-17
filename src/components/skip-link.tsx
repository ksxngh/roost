/**
 * "Skip to main content" link — the first thing in the tab order on every
 * shell with persistent navigation.
 *
 * It stays visually hidden until focused, then appears pinned to the top-left,
 * so a keyboard or screen-reader user can jump straight past the sidebar and
 * topbar to the page's `<main>`. The target must carry `id="main-content"` and
 * be focusable (`tabIndex={-1}`) so the browser moves focus there on activation.
 */
export const MAIN_CONTENT_ID = "main-content";

export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="bg-background text-foreground ring-ring sr-only z-50 rounded-md px-4 py-2 text-sm font-medium shadow-md focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:ring-2 focus-visible:outline-none"
    >
      Skip to main content
    </a>
  );
}
