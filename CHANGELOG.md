# Changelog

All notable changes to StudyForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver
(pre-1.0: minor = milestone).

## [0.1.0] — 2026-07-31 · Milestone 1: Foundation

### Added

- Next.js 16 (App Router) scaffold with strict TypeScript, Tailwind CSS v4,
  and shadcn/ui (radix base, 19 primitives).
- Dark-first design system: oklch token palette (brand hue 285), light mode,
  `next-themes` with system preference support and no-flash hydration.
- Authenticated app shell: desktop sidebar, mobile drawer navigation, sticky
  topbar with theme toggle; placeholder pages for Dashboard, Library,
  Flashcards, Quizzes, AI Chat, Guides, and Settings with consistent
  empty states.
- Marketing landing page.
- Validated environment configuration (`src/lib/env.ts`, Zod) with
  scheme-checked connection URLs.
- Test infrastructure: Vitest + Testing Library, 28 tests across env
  validation, utilities, navigation config, and interactive components.
- CI: GitHub Actions running lint, format check, typecheck, tests, build.
- Documentation: README, architecture (with diagrams), roadmap, testing
  guide, ADRs 0001–0003.

### Security

- Resolved all `npm audit` findings via targeted overrides
  (`sharp ^0.35`, `postcss ^8.5.18`); audit is clean.
