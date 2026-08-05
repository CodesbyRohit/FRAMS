# ANIMA — Architecture

## System diagram

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│   web (Next.js 15)       │  HTTP  │   api (NestJS 11)             │
│   Tailwind · Framer      │───────▶│   GraphQL (code-first)        │
│   Three.js (galaxy)      │        │   ┌─────────────────────────┐ │
│   SSE (twin updates)     │◀───────│   │ auth · identity · twin  │ │
└──────────────────────────┘        │   │ memory · rag · agents   │ │
                                    │   │ insights · knowledge    │ │
                                    │   └─────────────────────────┘ │
                                    └──────┬───────┬────────┬───────┘
                                           │       │        │
                             ┌─────────────▼┐  ┌────▼─────┐ ┌▼────────────┐
                             │ trust        │  │ redis    │ │ postgres    │
                             │ (FastAPI,    │  │ sessions │ │ identities, │
                             │ face engine) │  │ events   │ │ twins,      │
                             │ liveness     │  │ pub/sub  │ │ memory      │
                             └─────────────┘  └────┬─────┘ │ events      │
                                                    │       └────────────┘
                                            ┌───────▼────┐  ┌────────────┐
                                            │ neo4j      │  │ qdrant     │
                                            │ knowledge  │  │ vectors    │
                                            │ graph      │  │ (memories, │
                                            └────────────┘  │ documents) │
                                                            └────────────┘
```

## Key flows

### Identity lifecycle
1. `onboard` creates `persons` row + empty `Twin`.
2. `registerPasskey` binds a WebAuthn credential → JWT session (Redis-backed).
3. `enrollFace` sends one photo to the **Trust Service**; only embeddings are
   stored, never raw photos.
4. Login: `loginWithPasskey` **or** `loginWithFace` (Trust Service global
   match → session). A `VERIFICATION_SUCCEEDED` memory event is emitted.

### Memory pipeline (event-driven)
`MemoryService.ingest` appends a `MemoryEvent` and publishes on the event bus.
`MemoryIndexer` consumes asynchronously: embed → Qdrant upsert → consolidate
`Memory` row → twin mutation (skills/stats) → Neo4j projection → `twin.updated`
bus event → SSE to the browser.

### RAG
Upload (REST multipart) → text extraction (text formats, or vision model for
images/PDF) → `chunkText` (deterministic, overlap) → embed → Qdrant. `ask`
retrieves person-scoped vectors, prompts the LLM with citations enforced.

### Agents
`CopilotService` builds ten agents over five tools (`memory_search`,
`knowledge_graph`, `rag_search`, `twin_state`, `trust_status`). Intent routing
scores agents by keyword overlap; the agent runs its top tools; the LLM composes
the answer; tool calls + sources are returned to the UI. If the LLM is
unreachable, the agent answers deterministically from tool evidence.

## Availability posture

- Neo4j, Qdrant and the Trust Service are *availability-optional*: when
  offline, the API degrades honestly (empty snapshots, clear messages, deferred
  sync) instead of failing.
- Redis failures never crash the process; sessions fall back to JWT-only.

## Security notes

- `synchronize: true` is dev-only; production uses TypeORM migrations (roadmap).
- Trust Service auth via shared bearer token; WebAuthn challenges in Redis with
  5-minute TTL; sessions revocable in Redis.
- Vector and graph queries are always filtered by `personId`.
