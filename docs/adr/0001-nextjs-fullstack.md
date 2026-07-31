# ADR-0001: Next.js route handlers instead of a separate NestJS backend

**Status:** Accepted · **Date:** 2026-07-31

## Context

The recommended stack allowed either Next.js API routes or a standalone
NestJS service for the backend.

## Decision

Use Next.js (App Router) as the single web-facing application: React Server
Components for reads, route handlers + server actions for writes, and
separate BullMQ worker processes (plain TypeScript, same repo) for heavy
async work.

## Rationale

- **One deployable, one toolchain.** No cross-repo type drift, no API client
  codegen; shared Zod schemas validate both client forms and server input.
- **Streaming is first-class.** AI chat and generation stream over route
  handlers with no extra plumbing.
- **The real backend split is web vs. workers,** not web vs. API server.
  Parsing, OCR, and embedding jobs run in worker processes where NestJS-style
  structure adds little; the queue is the boundary.
- **Scale path:** stateless web tier scales horizontally on Vercel; workers
  scale independently on Railway/Fly. If an independent API team ever
  materializes, route handlers can be extracted behind the same service
  layer.

## Consequences

- Business logic must live in framework-agnostic service modules
  (`src/server/…` from Milestone 2 on), never inline in route handlers, so it
  stays testable and extractable.
- Long-running work must never run in a request; the queue is mandatory.
