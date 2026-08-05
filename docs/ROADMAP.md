# ANIMA — Roadmap & Runbook

## Immediate (this repo)

- [x] Monorepo: `@anima/shared`, `@anima/api`, `@anima/web`, `@anima/trust`
- [x] Trust Service: register / verify / liveness / composite score
- [x] Passkey (WebAuthn) + face login + revocable sessions
- [x] Digital Twin with skills, goals, narrative, stats
- [x] Event-sourced memory + semantic recall (Qdrant)
- [x] Knowledge graph sync + 3D galaxy (Neo4j + Three.js)
- [x] RAG corpus with citations
- [x] Ten agents + copilot + deterministic fallback
- [x] Explainable insights/predictions
- [x] Docker Compose + K8s manifests

## Next 90 days

- [ ] TypeORM migrations (drop `synchronize` in prod)
- [ ] Liveness challenge in the browser (multi-frame capture → trust service)
- [ ] Continuous-auth: risk-based session revocation on anomalous behavior
- [ ] GraphQL subscriptions for live twin + galaxy updates
- [ ] SSE backpressure + auth via cookie for SSE
- [ ] End-to-end test suite (Playwright) + GitHub Actions CI
- [ ] Upload chunking for large documents; PDF-first extraction

## Year 1

- [ ] Organization / team graphs with consent
- [ ] Cross-person collaboration recommendations
- [ ] Agent memory: each agent keeps its own long-term store
- [ ] Explainability UI: drill from insight → evidence → raw event
- [ ] Local-first mode: twin runs on-device, syncs privately

## Year 2

- [ ] Federated twins across organizations
- [ ] Marketplace of identity apps (consumers of the Trust API)
- [ ] Voice as a second trust factor (multimodal verification)

## Runbook

### Local development
```bash
npm install                 # workspace install (api + web)
npm run infra:up            # postgres, neo4j, redis, qdrant (+ trust, api, web)
npm run dev:trust           # Trust Service on :8090 (needs face_recognition)
cp .env.example .env        # set ANIMA_JWT_SECRET (≥32 chars) + LLM vars
npm run dev:api             # NestJS on :4000
npm run dev:web             # Next.js on :3000
```

### LLM configuration
Point `ANIMA_LLM_BASE_URL` at any OpenAI-compatible endpoint:
- **Ollama (local, free):** `http://localhost:11434/v1` with
  `ANIMA_LLM_MODEL=llama3.2` and `ANIMA_EMBEDDING_MODEL=nomic-embed-text`
  (also set `ANIMA_EMBEDDING_DIM=768`).
- **OpenAI:** default values with your key.
- **Azure / Groq / LM Studio / vLLM:** same interface.

### Testing
```bash
npm run typecheck           # both TS workspaces
npm test --workspace @anima/api
cd services/trust && python -m unittest discover -s tests -v
```

### Production (Kubernetes)
```bash
kubectl apply -f infra/k8s/
```
Then set real secrets in `anima-secrets` and deploy images `anima/api`,
`anima/web`, `anima/trust`.

### Health checks
- `GET /api/health` — API liveness
- `GET /api/graphql?query={knowledgeGraphAvailable}` — Neo4j status
- `GET http://localhost:8090/health` — Trust Service + face engine status
