# ANIMA — The Intelligence of Who You Are

*An AI Digital Identity Intelligence Platform.*

ANIMA is a complete reinvention of the FRAMS project. Attendance is gone —
deleted, not renamed. The facial recognition engine survives only as an
independent **Trust Service**: the gateway that verifies who you are, never a
system that watches you. The product is the AI Digital Twin — a living
understanding of a person's identity, memory, skills, relationships, goals and
growth.

> FRAMS asked "did they show up?" ANIMA asks "who are they becoming?"

---

## 1. New product vision

Every human will eventually have an AI that knows them for life. ANIMA is the
first platform built around that premise: an AI operating system for human
identity. It continuously learns who someone is, how they interact, what they
know, what they build, how they collaborate, how they learn and how they
evolve — and it can explain every single thing it believes.

## 2. Product name — and 19 alternatives

The chosen name is **ANIMA** — Latin for *soul, breath of life*; the animating
principle of a person. Short, ownable, pronounceable in every language.

| # | Name      | Rationale                                            |
|---|-----------|------------------------------------------------------|
| 1 | **ANIMA** | Soul / breath of life — the twin as your animating intelligence (chosen) |
| 2 | Synapse   | The junction where knowledge becomes thought          |
| 3 | Persona   | The mask that becomes the truth                       |
| 4 | Sentient  | The AI that feels your trajectory                     |
| 5 | Atlas     | The map of a life                                     |
| 6 | IdentityOS| What the product structurally is                      |
| 7 | NovaMind  | A mind that renews itself                             |
| 8 | Veritas   | The truth of who you are                              |
| 9 | Meridian  | Your line through time                                |
| 10 | Aura      | The field around a person                             |
| 11 | Mirror    | The twin as a truer reflection                        |
| 12 | Echo      | What you did, returned as understanding               |
| 13 | Lumina    | Light shed on a life                                  |
| 14 | Sovereign | Ownership of your own data and identity               |
| 15 | Axiom     | The self-evident truth of you                         |
| 16 | Nomic     | The law of your own becoming                          |
| 17 | Kadence   | The rhythm of your work                               |
| 18 | Reflect   | Understanding as reflection, not tracking             |
| 19 | Elysium   | The place where memory lives                          |
| 20 | Core      | The irreducible you                                   |

## 3. Mission statement

> **Give every person an AI that knows them for life — and let them own it.**

## 4. Unique value proposition

- **Not attendance software.** ANIMA repurposes face recognition into a trust
  layer and leaves tracking behind entirely.
- **Explainable by design.** Every memory, prediction and agent answer carries
  its evidence. No black boxes, no "AI said so".
- **Event-sourced identity.** Your life in the platform is an append-only
  stream — rewindable, auditable, and the source of every projection.
- **Conversational, not navigational.** Ten agents, one chat interface.
- **A galaxy, not a dashboard.** Relationships are spatial and explorable in 3D.

## 5. User personas

1. **The Builder** — an engineer whose projects, commits and skills compound
   into a career narrative. Wants: "what have I shipped?", "what should I build
   next?"
2. **The Researcher** — publishes, reads, documents. Wants grounded answers
   with citations from their own corpus.
3. **The Leader** — needs a trustworthy view of team capabilities and
   collaboration surfaces, without surveillance.
4. **The Learner** — tracks skills, gaps and learning velocity; wants
   recommendations, not dashboards.
5. **The Independent / Creator** — an individual who wants a private AI
   memory of their whole professional life.
6. **The Security-Sensitive User** — demands zero-knowledge posture, passkeys,
   revocable sessions and a right to be forgotten.

## 6. UI/UX redesign

Apple + Linear + OpenAI language: near-black `#05060a` canvas, aurora gradients
(violet → cyan), glassmorphism, Space Grotesk display type, Framer Motion
micro-interactions, and a Three.js knowledge galaxy. There is no "admin
dashboard" — there is a twin you talk to.

## 7. Information architecture

```
Landing → Identity (register/login via passkey or face)
  └─ /app  Digital Twin (narrative, skills, goals, stats, insights, timeline)
       ├─ /app/copilot   Conversational agents (chat, tool chain, sources)
       ├─ /app/galaxy    3D knowledge graph (explorable constellation)
       └─ /app/memory    Semantic recall, ingestion, document corpus
```

## 8. Folder structure

```
anima/
├─ packages/shared/        Domain types shared by API + web
├─ services/
│  ├─ api/                 NestJS + GraphQL + TypeORM (Postgres) core
│  ├─ trust/               Python FastAPI Trust Service (face recognition)
│  └─ web/                 Next.js 15 + Tailwind + Framer Motion + Three.js
├─ infra/                  docker-compose + Dockerfiles + k8s manifests
└─ docs/                   VISION, ARCHITECTURE, ROADMAP
```

## 9. Database schema (PostgreSQL)

`persons`, `twins`, `trust_profiles`, `passkeys`, `memory_events` (append-only
journal), `memories` (materialized units), `documents`. Vectors live in
Qdrant; relationships live in Neo4j; sessions/challenges live in Redis.

## 10. Microservice architecture

`web` (Next.js) → `api` (NestJS: auth/identity/twin/memory/rag/agents/insights)
→ `trust` (FastAPI). Infra: PostgreSQL, Neo4j, Redis, Qdrant. Event-driven via
the memory event bus (in-process + Redis PUB/SUB).

## 11. API design

GraphQL (code-first) for the product surface — `me`, `myTwin`, `myMemories`,
`knowledgeGraph`, `askCopilot`, `myInsights`, `myTrustProfile` — plus REST for
health (`/api/health`) and multipart uploads (`/api/rag/upload`), and SSE for
live twin updates (`/api/sse/twin/:id`).

## 12. AI architecture

Provider-agnostic LLM + embeddings clients (OpenAI-compatible). RAG pipeline:
extract (text or vision) → chunk → embed → Qdrant → grounded answers with
citations. Memory indexer: event → embed → consolidate → twin + graph.

## 13. Agent architecture

A lightweight framework: agents own a system prompt + tools; tools gather
evidence; the LLM composes; tool calls and sources are surfaced to the user.
Ten agents: identity, memory, research, learning, productivity, creativity,
networking, knowledge, planner, security. Routing is keyword/intent-based with
a deterministic fallback when no model is configured.

## 14. Knowledge graph model

Neo4j. Nodes: Person, Twin, Skill, Project, Goal, Memory, Document, Meeting,
Idea, Organization. Edges: WORKED_ON, HAS_SKILL, SET, HAS_MEMORY, AUTHORED,
KNOWS, CREATED, PARTICIPATED_IN. Synced from the memory event stream.

## 15. Vector database design

Qdrant, cosine distance. Collections: `anima_memories` (memory events) and
`anima_documents` (chunks). Every vector is person-scoped via payload filters —
strict privacy isolation by construction.

## 16. Event flow

```
any service ──ingest──▶ MemoryEvent (Postgres, append-only)
                            │
              event bus (EventEmitter + Redis PUB/SUB)
                            │
        ┌───────────────────┼───────────────────────┐
   MemoryIndexer      TwinUpdater            KnowledgeSync
   (embed→Qdrant,     (skills, goals,        (Neo4j nodes/edges)
    consolidate)       stats, narrative)             │
        └───────────────────┼───────────────────────┘
                     twin.updated (SSE → UI)
```

## 17. Security model

Zero-trust, zero-password: WebAuthn passkeys primary, face verification through
the Trust Service (liveness blink-challenge, replay detection), JWT + revocable
Redis sessions, person-scoped vector/graph queries, right-to-be-forgotten
deletion, and a trust score that explains itself.

## 18. Cloud deployment

Docker + Kubernetes. Namespace `anima`, StatefulSets for Postgres/Neo4j/Qdrant,
Deployments for API (2 replicas) and web, ingress with TLS, readiness/liveness
probes, secrets via K8s secrets, LLM via OpenAI-compatible endpoints
(Ollama/OpenAI/Azure/Groq).

## 19. 3-year roadmap

- **Year 1 — Identity layer**: passkeys, Trust Service, twin + memory, agents,
  galaxy. *(what this repo builds)*
- **Year 2 — Network layer**: organizational graphs, team capability surfaces,
  shared knowledge graphs with consent, cross-person collaboration agents.
- **Year 3 — Autonomous layer**: proactive agents, self-updating twin,
  federated private twins, marketplace of identity apps.

## 20. Features no competitor has

1. Face recognition as an **independent reusable trust API** — never tracking.
2. **Explainable AI as a product surface** — every insight, memory and agent
   answer shows its evidence and tool chain.
3. **Event-sourced identity** — your history is a rewindable, auditable stream.
4. A **3D knowledge galaxy** you can walk through.
5. **Semantic recall of a whole professional life**, not a chat history.
6. **Ten-strong agent system** with a deterministic no-LLM fallback.
7. Person-scoped vector isolation **by construction**, not by convention.
