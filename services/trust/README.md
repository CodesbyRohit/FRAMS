# ANIMA Trust Service

The identity-verification layer of the ANIMA platform. **Face recognition is
the gateway, never the product** — this service has zero attendance, tracking or
surveillance semantics. It exposes a reusable REST API that any ANIMA service
(and any external product) can consume.

## Responsibilities

- **Secure onboarding** — register a subject's face (`POST /identities`)
- **Passwordless authentication** — verify a face (`POST /verify`)
- **Liveness / anti-spoofing** — blink-challenge detection (`POST /verify/liveness`)
- **Composite identity scoring** — fuse face + liveness + device + behavior (`POST /score`)
- **Right to be forgotten** — permanent erasure (`DELETE /identities/{id}`)

## Run

```bash
cd services/trust
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
TRUST_SERVICE_TOKEN=anima-trust-local uvicorn app.main:app --reload --port 8090
```

The engine (`face_recognition` / `dlib`) must be installed for verification to
work; `/health` reports `degraded` until it is.

## API surface

| Method | Path                  | Purpose                                   |
| ------ | --------------------- | ----------------------------------------- |
| GET    | `/health`             | Readiness + engine availability           |
| POST   | `/identities`         | Register a face (multipart image)         |
| GET    | `/identities`         | List identities                           |
| DELETE | `/identities/{id}`    | Erase an identity                         |
| POST   | `/verify`             | Verify a face (scoped or global)          |
| POST   | `/verify/liveness`    | Blink-challenge verification (anti-spoof) |
| POST   | `/score`              | Composite identity confidence score       |

All endpoints (except `/health`) require `Authorization: Bearer <TRUST_SERVICE_TOKEN>`.
