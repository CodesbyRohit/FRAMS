# ANIMA — The Intelligence of Who You Are

> An AI Digital Identity Intelligence Platform. A complete reinvention of FRAMS:
> attendance deleted, face recognition reimagined as an independent **Trust
> Service**, and the product rebuilt around an evolving **AI Digital Twin**.

## What it is

ANIMA gives every person a twin that continuously understands who they are —
identity, memory, skills, goals, relationships, growth — learned from the work
they already do. It is conversational (ten agents, one chat), spatial (a 3D
knowledge galaxy), and explainable (every insight shows its evidence).

## Repo layout

```
packages/shared    Domain types shared across services
services/api       NestJS + GraphQL core (identity, twin, memory, RAG, agents)
services/trust     Python FastAPI Trust Service (face = trust layer only)
services/web       Next.js app (premium UI, 3D galaxy)
infra/             Docker Compose + Dockerfiles + Kubernetes manifests
docs/              VISION · ARCHITECTURE · ROADMAP
```

## Quick start

```bash
npm install
cp .env.example .env        # set ANIMA_JWT_SECRET (≥ 32 chars)
npm run infra:up            # postgres, neo4j, redis, qdrant
npm run dev:trust           # Trust Service (:8090) — needs face_recognition
npm run dev:api             # API (:4000)
npm run dev:web             # Web (:3000)
```

Then open **http://localhost:3000**, create your identity with a passkey, and
enroll your face. The face never marks attendance — it just opens the door.

## Documentation

- [VISION.md](docs/VISION.md) — product design (all 20 deliverables)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & key flows
- [ROADMAP.md](docs/ROADMAP.md) — roadmap & runbook

## Stack

Next.js 15 · NestJS 11 · GraphQL (code-first) · TypeORM/PostgreSQL · Neo4j ·
Redis · Qdrant · FastAPI + face_recognition · Tailwind · Framer Motion ·
Three.js (react-three-fiber) · WebAuthn · Docker · Kubernetes
