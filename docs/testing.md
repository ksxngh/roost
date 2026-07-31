# Testing

## Stack

- **Vitest** with the jsdom environment; config in `vitest.config.ts`.
- **@testing-library/react** for component tests, **user-event** for
  interactions, **jest-dom** matchers via `src/test/setup.ts`.

## Conventions

- Tests are colocated: `foo.ts` → `foo.test.ts` in the same directory.
- Query by **role and accessible name** (`getByRole("link", { name: … })`),
  never by class or test id — tests double as accessibility checks.
- Mock at the module boundary (`next/navigation`, `next-themes`), not deeper.
- Generated shadcn primitives in `src/components/ui/` are excluded from
  coverage; we test our composition of them instead.

## Running

```bash
npm run test            # single run (CI mode)
npm run test:watch      # watch mode
npm run test:coverage   # v8 coverage report
```

## Current suite (Milestone 1)

| Area               | Coverage                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| `lib/env`          | Defaults, valid configs, malformed URLs, wrong schemes, unknown NODE_ENV               |
| `lib/utils` (`cn`) | Merging, falsy handling, tailwind conflicts, empty input                               |
| `lib/site-config`  | Metadata presence, duplicate hrefs, href/segment consistency                           |
| `SidebarNav`       | Landmark + links, aria-current on active/nested/unknown routes, empty list, onNavigate |
| `ThemeToggle`      | Accessible trigger, menu options, setTheme wiring                                      |
| `EmptyState`       | Content rendering, optional action slot                                                |

Integration/API/E2E layers arrive with the features they test (API tests in
Milestone 2 alongside the first route handlers; Playwright E2E once auth
flows exist).
