# ADR-0003: pgvector over a dedicated vector database

**Status:** Accepted (implementation in Milestone 4) · **Date:** 2026-07-31

## Decision

Store embeddings in PostgreSQL with the pgvector extension rather than
Pinecone or Qdrant.

## Rationale

- **Ownership filtering is the hot path.** Every retrieval is "nearest
  chunks _within this user's documents_". In Postgres that is one indexed
  query joining chunks to documents; with an external vector DB it becomes
  metadata-filter fan-out plus a second round trip to hydrate content.
- **Transactional consistency.** Deleting a document deletes its chunks and
  vectors in the same transaction — no orphaned vectors, no reconciliation
  jobs.
- **Operational surface.** One database to back up, monitor, and secure.
  At tens of thousands of users (millions of chunks), HNSW indexes handle
  this comfortably.
- **Escape hatch.** Retrieval goes behind a `VectorStore` interface; if scale
  ever demands Qdrant, it's an adapter swap plus a backfill job, not a
  rewrite.

## Consequences

- Hosting must support pgvector (Neon, Supabase, RDS all do).
- Prisma lacks native vector column support; the embedding column and HNSW
  index are managed via raw SQL migrations, and similarity queries use
  `$queryRaw` inside the repository layer.
