# ANIMA — Engineering Audit (Stage A)

**Date:** 2026-10-14 · **Repo:** `CodesbyRohit/FRAMS` (`main`, commit `d3caa21`) ·
**Scope:** every tracked source file in `services/api`, `services/trust`,
`services/web`, `packages/shared`, `infra/`, `docs/`.

Findings are split into **confirmed** (observed in the code, with file:line)
and **hypotheses** (plausible, need a running dependency or browser to prove).
Line numbers refer to commit `d3caa21` plus the uncommitted working-tree
changes that existed when the audit started.

---

## 0. Baseline (Phase 1)

### Git state at start
- Branch `main`, single commit `d3caa21`, remote `origin` → `CodesbyRohit/FRAMS`.
- Uncommitted user changes (preserved, not reverted): `package.json` (root
  `test` no longer runs web), `services/web/package.json` (ESLint added, Jest
  removed, `engines`), `services/web/lib/webauthn.ts` (removed unused
  `arrayBufferToBase64Url`), `package-lock.json`; untracked
  `docs/VERCEL_DEPLOYMENT.md`, `services/web/{.env.example,.nvmrc,eslint.config.mjs,vercel.json}`.
- Sibling directories `~/FRAMS/backend` and `~/FRAMS2.0` are older, unrelated
  copies (not git repos) and were not touched.

### Toolchain
Node 24.14.1 / npm 11.19.0 (repo declares `>=20`, `.nvmrc` 22) · Python 3.13.15
(3.11 also installed; Trust Dockerfile uses 3.11) · Docker CLI 29.8.2 —
**daemon not running** · `face_recognition`/dlib **not installed** on this host.

### Checks actually executed
| Check | Result |
|---|---|
| `npm run typecheck -w @anima/api` | ✅ exit 0 |
| `npm run typecheck -w @anima/web` | ✅ exit 0 |
| `npm test -w @anima/api` (Jest) | ✅ 2 suites, 8 tests passed |
| `npm run lint -w @anima/web` | ✅ exit 0 |
| `python -m unittest discover -s tests` (trust) | ✅ 7 tests passed (against globally installed FastAPI 0.141 / Pydantic 2.13, not the pinned 0.115.6 / 2.10.4) |
| `npm run build -w @anima/web` | ❌ **ENOSPC — C: drive has 0.36 GB free.** Environment failure, not a code failure. |
| `npm run build -w @anima/api` | not reached (same run) |
| `npm audit --omit=dev` | 30 advisories: 2 critical, 22 high, 6 moderate (see §7) |
| Integration / e2e against Postgres, Redis, Neo4j, Qdrant | ❌ not possible — Docker daemon not running |
| Face matching / liveness against real images | ❌ not possible — `face_recognition` not installed |

There are **no** integration tests, auth tests, web tests, e2e tests or CI
workflows in the repository.

---

## 1. Security & privacy — confirmed defects

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| S1 | **Critical** | **Session revocation is never enforced.** The global guard only verifies the JWT signature; it never checks the Redis session. `logout` deletes a key nothing reads. The web "Sign out" doesn't even call `logout`. A stolen token is valid for 8 h regardless. | `api/src/common/jwt-auth.guard.ts:52-57`, `auth/sessions.service.ts:50-52` (unused `isActive`), `web/app/app/layout.tsx:30-33` |
| S2 | **Critical** | **Account takeover via public passkey registration.** `passkeyRegistrationOptions(personId)` and `registerPasskey(personId, …)` are `@Public()` and accept any `personId`. Anyone who learns a personId can bind *their* authenticator to that identity and receive a session — at any time, not just during onboarding. | `api/src/auth/auth.resolver.ts:18-36`, `auth/passkeys.service.ts:63-120` |
| S3 | **Critical** | **IDOR:** any signed-in user can call `person(id)` and read another identity's email, bio, roles — and, through the `twin` field resolver, their entire Digital Twin. | `api/src/identity/identity.resolver.ts:24-27, 58-61` |
| S4 | **Critical** | **Face-only 1:N login issues a full session from one still image**, with no liveness check and no claimed identity. A photo of an enrolled user is enough. The liveness route exists in the Trust Service but the API never calls it. | `api/src/auth/auth.service.ts:85-110`, `trust/app/main.py:91-134`, `api/src/trust/trust.service.ts:110` (unused) |
| S5 | **High** | **Caller-controlled trust inputs.** `deviceScore` / `behavioralScore` come from the client (the login page hard-codes `0.7` / `0.6`) and feed the composite score; on the liveness route they decide `verified` (`identity_score >= 0.5`). Nothing in the system measures device posture or behaviour. | `api/src/auth/auth.resolver.ts:58-63`, `web/app/login/page.tsx:62`, `trust/app/main.py:152-160` |
| S6 | **High** | **Multi-face enrollment.** Enrollment stores the encodings of *every* face in the image under one subject, so one account can contain someone else's face. No check whether the face is already enrolled under another subject. | `trust/app/services/face_service.py:54-71` |
| S7 | **High** | **No biometric deletion path.** The Trust Service has `DELETE /identities/{id}` but the API/UI never call it; there is no account deletion either. | `trust/app/main.py:186-192`; no caller in `services/api` |
| S8 | **High** | **Trust Service hardening gaps:** CORS defaults to `*`; the shared bearer token defaults to the public string `anima-trust-local` everywhere (code, Compose, a K8s *ConfigMap*); token compared with `!=` (not constant-time); unauthenticated `/health` discloses the number of enrolled identities; no byte, pixel or frame-size limits on uploads (decompression-bomb / memory exhaustion); no rate limiting anywhere (face brute-force, onboarding spam). | `trust/app/main.py:31-36, 41-43, 51-59, 78, 103, 143`; `trust/app/config.py:14`; `api/src/config/env.validation.ts:63`; `infra/k8s/configmap.yaml:16` |
| S9 | **High** | **Forgeable memory events.** `ingestMemory` accepts any `type` string — including `VERIFICATION_SUCCEEDED` — so a user can plant "Identity verified via face" memories that agents later cite as evidence. `payload` is `JSON.parse`d unguarded (500 on bad JSON); non-string `skills` crash the indexer; `summary` is unbounded. | `api/src/memory/memory.resolver.ts:73-94`, `memory/memory-indexer.service.ts:176-179` |
| S10 | **High (latent)** | **Cross-tenant knowledge graph.** Skill/Project/Goal/Idea/Meeting nodes and collaborator `Person {name}` nodes are `MERGE`d *globally* by name, and the galaxy query walks 2 hops — through a shared `Skill` it reaches other people's `Person` nodes and their neighbours. Latent today only because of F2. | `api/src/knowledge/knowledge.service.ts:116-185, 211-218` |
| S11 | Medium | JWT kept in `localStorage` (XSS-exfiltratable); SSE passes the JWT in the query string (ends up in access logs) and doesn't check revocation. | `web/lib/auth.ts:17-20`, `api/src/memory/sse.controller.ts:27-65` |
| S12 | Medium | WebAuthn `userVerification: 'preferred'` + `requireUserVerification: false` for a *sole* factor; a UV-less security key tap is enough. | `api/src/auth/passkeys.service.ts:80, 98, 131, 162` |
| S13 | Low | Email enumeration ("No identity matches this email"); GraphQL introspection on in production; 25 MB JSON body limit on every route. | `passkeys.service.ts:140-142`, `app.module.ts:39`, `main.ts:24` |

## 2. Functional defects — confirmed

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | **Critical** | **Vector indexing can never succeed.** Qdrant point IDs must be unsigned integers or UUIDs; the code uses prefixed strings (`chunk_doc_…`, `mem_…`). Every document upload therefore ends in `503 Indexing failed`, and memory vectors are skipped with a warning, so semantic recall always returns nothing. *(Contract-level finding; to be re-verified against a live Qdrant.)* | `api/src/rag/rag.service.ts:100`, `memory/memory-indexer.service.ts:114-120` |
| F2 | **Critical** | **The knowledge graph is never populated.** `syncPerson` is never called, and every `syncEvent` statement starts with `MATCH (p:Person {id})`, which matches nothing — so no node or edge is ever written. | `knowledge.service.ts:93` (no callers), `:117-195` |
| F3 | High | Even when populated, edges can't attach: edge endpoints use Neo4j internal ids while nodes with an `id` property use that property as their id. | `knowledge.service.ts:228, 245-246` |
| F4 | High | `knowledgeGraphAvailable` is `true` as soon as the driver *object* exists — connectivity is never checked; `getGraph` throws (uncaught) when Neo4j is down. | `knowledge.service.ts:43-67, 204-259` |
| F5 | High | Face enrollment has **no UI** (`ENROLL_FACE` is defined but unused), so face login is unreachable from the product. | `web/lib/graphql.ts:69` |
| F6 | High | Document upload never emits `DOCUMENT_ADDED` (the controller comment says it does), so the twin's document count and graph never change. No document deletion. | `api/src/rag/rag.controller.ts:15-19, 26-48` |
| F7 | High | **Lost updates on the twin.** Each event triggers several unlocked read-modify-write saves of the whole twin row, events are processed concurrently, and `setGoal` races the indexer — goals, skills and counters can be silently overwritten. | `twin/twin.service.ts:61-120`, `memory/memory-indexer.service.ts:65-94`, `memory/memory.resolver.ts:116-130` |
| F8 | Medium | `daysActive` is never written (always 0) → insights say "across 0 day(s)". | `insights/insights.service.ts:88-97`, `twin.service.ts:73` |
| F9 | Medium | Memory evidence is flattened to `{label, detail: label}` — evidence type/id is dropped, so nothing can link back to its source event. | `memory/memory.resolver.ts:31, 67` |
| F10 | High | **Manufactured citations.** Every Copilot tool result is returned as a "source", including `"No matching memories found."`; `rag_search` nests a second LLM call and presents the *generated* answer as a source snippet. RAG sources carry no document id or chunk index, so citations can't link anywhere. | `agents/copilot.service.ts:138-141, 172-179`; `rag/rag.service.ts:232-238` |
| F11 | High | Semantic search outages are reported as "no results" (connectivity errors swallowed). The UI can't distinguish "offline" from "nothing found". | `memory/memory.service.ts:101-107`, `rag/rag.service.ts:197-202` |
| F12 | Medium | Copilot fallback always says "an LLM is not configured", even on timeouts or provider errors; the embeddings client has no timeout; retrieved documents are inserted into the prompt without being marked as untrusted data (prompt-injection exposure). | `agents/framework.ts:106-135`, `ai/embeddings.client.ts:35`, `rag/rag.service.ts:225-229` |
| F13 | High | **Fabricated confidence.** Insights carry hard-coded confidences (0.82, 0.71, 0.9, 0.66, 0.75) shown to users as percentages; "fastest-growing skill" is really "most evidence events". | `insights/insights.service.ts:58, 79, 98, 119, 135` |
| F14 | High | **Fabricated trust posture.** `identityScore`/`deviceScore`/`behavioralScore` default to 0.5 and are reported by the Security agent as "Device posture: 50%"; `identityScore` is an all-time max; `trustScorePreview` accepts caller scores. | `trust/trust.entity.ts:12-19`, `agents/copilot.service.ts:201-213`, `trust/trust.service.ts:149`, `trust/trust.resolver.ts:26-38` |
| F15 | Medium | Docs claim "Redis failures … sessions fall back to JWT-only"; in reality login fails when Redis is down (`redis.set` rejects). | `docs/ARCHITECTURE.md:62`, `auth/sessions.service.ts:35` |
| F16 | Medium | Copilot is a GraphQL *query* (non-idempotent work over GET-able op); no message length bound. | `agents/copilot.resolver.ts:17-23` |

## 3. Broken or incomplete user journeys

| Journey | Status |
|---|---|
| 1. Registration | Works end-to-end *only* if Redis + Postgres are up; vulnerable (S2). Identity is created before the passkey succeeds — a cancelled ceremony leaves an orphan identity whose email can never be registered again. |
| 2. Passkey register / login | Implemented; S1, S2, S12. Uses `PublicKeyCredential.toJSON()`, which older Safari/Firefox lack (H2). |
| 3. Face enrollment / verification | Enrollment unreachable (F5); login insecure (S4–S6). |
| 4. Twin retrieval / updates | Retrieval works; updates race (F7); UI errors become an endless spinner. |
| 5. Memory creation / semantic search | Creation works; vectors never indexed (F1); outage = empty (F11). |
| 6. Document upload / citations | Upload always fails at indexing (F1); citations not linkable (F10). |
| 7. Copilot routing / tools | Runs; keyword routing (honestly described in ARCHITECTURE, oversold on landing); fabricated sources (F10, F14). |
| 8. Knowledge graph | Never populated (F2); edges broken (F3); availability misreported (F4); latent cross-tenant leak (S10). |
| 9. Session revocation / account deletion | Revocation ineffective (S1); no account or biometric deletion (S7). |
| 10. Dependency outages | Postgres down → boot failure (acceptable). Redis down → login fails, docs say otherwise. Neo4j down → galaxy query throws. Qdrant down → silent empty results. LLM down → honest-ish fallback. Trust down → 503 message mentions installing `face_recognition` even when the host is merely unreachable. |

## 4. Visual & interaction problems — confirmed

- **Landing page fabrications:** fictional persona "Aurora Chen" with 148 memories / 12 projects / 3,204 interactions, skill percentages, "v12", and a narrative about "12 consecutive weeks of practice" — none labelled as sample data (`web/app/page.tsx:110-138`); an "Identity confidence **92.4%**" tile (`:236`); claims "Blink-challenge liveness — photos and replays fail" (`:217`) though login never uses liveness; "continuous identity confidence score", "never forgets", "takes 30 seconds".
- Landing nav links are hidden below `md` with no mobile alternative (`page.tsx:55`); no Open Graph/Twitter metadata (`app/layout.tsx:11-16`).
- App: static "twin is learning" live badge (`app/app/page.tsx:65-67`); infinite spinner on error (`:33`); forms clear input before the mutation succeeds and errors become unhandled rejections (`:117-170`); memory search has no `catch` (`memory/page.tsx:33-42`); upload reports "indexed" without checking status; "vector-indexed" badge is static.
- Sign-out leaves the Apollo cache populated (next user can briefly see the previous user's data); an expired token is never handled (pages break instead of redirecting).
- Galaxy: hover-only selection (no click/keyboard), no list view, no non-WebGL fallback, continuous auto-rotation ignores `prefers-reduced-motion`, raycasting every frame.
- Accessibility: form inputs without associated `<label>`s on login/copilot/memory; tab toggles are plain buttons without `aria-pressed`/`role="tab"`; emoji glyphs as icons without labels; low-contrast `text-slate-600` on near-black for meaningful text.

## 5. Architectural inconsistencies

- "Ten agents, each with its own tools and memory access" (copilot.service.ts:13) — agents share one tool set and have no memory of their own; routing is keyword overlap.
- "Event-driven / cross-replica" bus: only the in-process emitter has consumers; the Redis publish is write-only. With `replicas: 2` (K8s), SSE clients on one replica miss twin updates indexed on another.
- `synchronize: true` outside production and **no migrations at all**, while Compose runs the API with `NODE_ENV=production` → no schema.
- `@anima/shared` types diverge from the GraphQL wire types (e.g. `AgentToolCall.args` object vs string).

## 6. Build, test & deployment gaps — confirmed

- **Compose builds fail:** API/web build contexts are `services/api` / `services/web`, but their Dockerfiles `COPY` the root `package.json`, lockfile and `packages/` (`infra/docker-compose.yml:58, 84`; `services/api/Dockerfile:4-5`). The web image also copies a non-existent `public/` (`services/web/Dockerfile:23`).
- K8s: Trust Service data on `emptyDir` (biometric DB lost on every restart, `infra/k8s/services.yaml:25-27`); placeholder secrets committed in YAML; no probes or resource limits for trust/web; `NEXT_PUBLIC_API_URL` set at runtime has no effect (inlined at build).
- Containers run as root; no `.dockerignore`.
- No CI; root `test` omits the Python suite; web has zero tests; no e2e.
- Trust has no venv/lock; tests ran against unpinned global packages.

## 7. Dependency advisories (`npm audit --omit=dev`, 2026-10-14)

- **Critical:** `next@15.5.22` (unauthenticated RCE advisories incl. Windows-hosted servers and Image Optimization) — non-breaking fix in the 15.x line. `proxy-addr` (transitive via Express) — non-breaking fix.
- **High, non-breaking fixes:** `multer`/`@nestjs/platform-express`, `undici` (`@qdrant/js-client-rest`), `postcss`, `sharp`, `nanoid`, `brace-expansion`, `source-map-js`.
- **High, breaking fixes only:** `@nestjs/graphql`/`@nestjs/apollo` 13 → 14 (pulls `@graphql-tools/*`, `ws`, `micromatch`); `ws` via `@apollo/client` has no fix. These need a deliberate upgrade, not `audit fix --force`.

## 8. Hypotheses (need a live dependency or browser to confirm)

- **H1** Qdrant rejects the string point IDs in F1 (strong: documented contract).
- **H2** `PublicKeyCredential.toJSON()` is missing in some supported browsers → passkey ceremonies throw there.
- **H3** HOG face detection on 640×480 webcam frames is slow enough (~0.3–1 s/frame on CPU) that a 12-frame liveness check needs a tight frame budget.
- **H4** The EAR blink check is defeated by a video replay of the user blinking — it is a *presentation-attack deterrent*, not anti-spoofing.
- **H5** Verification threshold `0.5` (face_recognition distance) has never been calibrated on this population; FAR/FRR are unknown.

## 9. Prioritised remediation plan

Order reflects risk, not the order of the brief's stages: the critical security
and data-integrity defects are fixed before visual work, because a polished UI
over an account-takeover bug is not a demonstrable product.

| # | Work | Acceptance criteria |
|---|---|---|
| P0-1 | Enforce Redis-backed sessions in the guard and SSE; real logout; session list + revoke | Revoked token → 401 on next request (unit test); web sign-out calls `logout` and resets the cache |
| P0-2 | Passkey registration bound to an onboarding ticket (single-use, short TTL) or to an authenticated session for the same person; UV required | Registering for another personId without its ticket → 401 (test) |
| P0-3 | Remove `person(id)` IDOR | Only `me` exposes person data (test) |
| P0-4 | Face login = claimed email + multi-frame liveness, 1:1 only; no client trust scores; single-face enrollment; duplicate-face guard; biometric deletion; Trust hardening (CORS, constant-time token, size/pixel limits, health info) | Unit tests on API + Trust; UI captures a blink burst; consent + delete flow |
| P0-5 | Whitelist user-ingestable event types; validate payload | System types rejected (test) |
| P0-6 | Qdrant UUID point ids; per-person graph scoping; `syncPerson`; edge ids consistent; real availability probe | Unit tests on id generation & graph mapping; no cross-owner MERGE |
| P0-7 | Twin mutations under row lock in a transaction | Concurrent-update test (sequenced) |
| P1 | Honest AI: real citations with ids, no tool-summary sources, evidence of unavailability, untrusted-context fencing, timeouts, no fabricated confidence/trust scores | Tests for empty retrieval, provider failure, malformed output, cross-user filter |
| P1 | App shell, auth state, error/empty/loading/offline states, Identity & Security page | Manual + interaction tests |
| P2 | Design tokens, landing rebuild with labelled demo data + implemented-vs-roadmap section, galaxy list view / reduced motion / no-WebGL | Lint/build, keyboard pass |
| P3 | Dockerfiles/Compose fix, non-root, migrations note, K8s honesty, CI, Next.js security patch, docs truthfulness | `docker compose config` valid; CI file; docs match code |
