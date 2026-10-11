# FRAMS 2.0 — Phase Zero Repository Audit

_Audit date: 2026-10-11 · Target: `CodesbyRohit/FRAMS` (local clone, branch `main` @ `32fd077`)_
_Method: read-only inspection of the working tree, `git` metadata, and execution of the existing lint/build scripts. No database was contacted; no secrets or biometric data were printed._

---

## 0. Repository state at audit time (must be protected)

| Item | Finding |
|---|---|
| Branch | `main`, tracking `origin/main`, 3 commits total |
| Uncommitted tracked changes | 33 files, **+1,948 / −515 lines** of real content (whitespace/CRLF-insensitive diff) |
| Staged changes | `package.json`, `package-lock.json`, `src/main.jsx` (Vercel Speed Insights) |
| Untracked user files | `PRESENTATION_GUIDE.md`, `SYSTEM_DESIGN.md`, `src/components/DebugPanel.jsx`, `src/components/McuVfxIntro.jsx`, `src/services/{audioService,observabilityService,voiceService}.js` |
| Last user activity | 2026-03-27 |
| Related local projects | `~/FRAMS/anima` (Aug 2026, "complete reinvention of FRAMS — attendance deleted"), `~/FRAMS/backend` (FastAPI), `~/FRAMS2.0` (non-git copy), `~/Physics/frams` (different repo). **Not modified by this audit.** |

> The audit describes the **working tree** (the user's current version), not `HEAD`.

---

## 1. Current architecture

```
Browser (React 19 + Vite 8, plain JS/JSX, inline styles + src/index.css)
 ├─ face-api.js 0.22 (TF.js)  ── loads /public/models: SSD MobileNet v1, 68-pt landmarks,
 │                               ResNet-34-style 128-D face recognition net
 ├─ Scanner.jsx  ── detection loop (setTimeout 150 ms) + rAF canvas HUD
 │     · downloads ALL users incl. faceDescriptor + faceImage via GET /api/users
 │     · matches locally (FaceMatcher), computes blink (EAR), motion, "behavior similarity",
 │       risk score — all client-side
 │     · POST /api/attendance/mark with client-computed confidence + risk
 ├─ Register.jsx ── single-frame descriptor + base64 JPEG snapshot → POST /api/users
 ├─ Dashboard / Records / Export ── GET /api/attendance + /api/users, aggregate in browser
 ├─ StudentDashboard ── GET /api/attendance/student/:id
 └─ api.js (axios, baseURL hardcoded http://localhost:5000/api, JWT in localStorage)

Server (Express 5, CommonJS, Mongoose 9)
 ├─ /api/auth   login · register · profile
 ├─ /api/users  list · create · get · delete · bulk clear · update-behavior
 └─ /api/attendance  list · mark · student/:id · clear
MongoDB: collections `users`, `attendances` (no migrations framework)
```

**Dependency map (runtime):** react, react-router-dom 7, axios, face-api.js, recharts, lucide-react, react-hot-toast, papaparse, uuid, @vercel/analytics, @vercel/speed-insights · server: express 5, mongoose 9, jsonwebtoken, bcryptjs, cors, morgan, dotenv.

---

## 2. Feature reality check

| Claimed capability (README / SYSTEM_DESIGN) | Reality | Evidence |
|---|---|---|
| Face detection (SSD) | **Implemented**, in browser | `src/services/faceService.js` |
| Face recognition (ResNet-34 128-D) | **Implemented**, in browser; server never verifies | `Scanner.jsx:95-127, 263` |
| Blink liveness (EAR) | **Implemented, weak**: threshold 0.28, one blink suffices | `Scanner.jsx:301-312` |
| Motion liveness | **Implemented, weak**: cumulative nose displacement > 4 px | `Scanner.jsx:314-319, 357` |
| Frame stability | **Nominal only**: "≥ 3 frames seen"; `stabilityScore` always sent as `1.0` | `Scanner.jsx:359, 375` |
| Behavioral biometrics | **Implemented heuristically**, unvalidated; first scan = "learning mode" auto-pass | `Scanner.jsx:324-345` |
| Adaptive threshold (moving average) | **Implemented**, but client-supplied and written via an **unauthenticated** endpoint | `Scanner.jsx:366-377`, `userRoutes.js:16` |
| LOW/MEDIUM/HIGH risk | **Implemented client-side**; server stores whatever the client sends | `Scanner.jsx:37-62`, `attendanceController.js:5,42-44` |
| Anti-spoofing | **Not established.** Blink + small motion are defeated by video replay; no evidence of measured accuracy | — |
| RBAC | **Partial** — several endpoints unprotected, see §4 | — |
| "100/100 Lighthouse" | **Unverified claim**; bundle is 1.43 MB single chunk | build output |
| "Zero-Failure Auth: Master Key failover" | **Real, and it is an authentication bypass** | `api.js:47-68`, `authController.js:15-20` |
| Real-time analytics | **30 s polling**; aggregates computed in browser over the full collection | `Dashboard.jsx:156-159` |
| CSV export | **Implemented** (papaparse) | `Export.jsx` |
| Attendance corrections / disputes | **Not implemented** | — |
| Classes / courses / sessions | **Not implemented** (attendance is one record per user per calendar day) | `Attendance.js` |
| Audit log | **Not implemented** | — |
| Anomaly investigation | **Not implemented** (only counters and a donut chart) | `Dashboard.jsx` |
| Voice assistant "A.R.I.A." | Implemented via Web Speech API (untracked user files) | `src/services/voiceService.js` |

### Simulated / fabricated data in the UI
- `StudentDashboard.jsx:45` — **`totalClasses = 30` is hardcoded**; "Attendance Rate" is fabricated from it. Chart shows a 0/100 "score".
- `App.jsx:21-22` — `window.DEMO_SAFE_MODE = true` **globally** in production builds.
- `api.js:29-73` — in DEMO_SAFE_MODE, a failed `/attendance/mark` is reported to the user as **success** and queued in `localStorage` (never synced); failed list fetches silently return `[]`, which renders as "no data" instead of an error.
- `AuthContext.jsx:48,52` — fabricated `demo_*` IDs and `offline_bypass_token` if the response is malformed.
- `ErrorBoundary.jsx:80` — random "ERROR_CODE".
- Scanner "SYSTEM.TRUST %" is an unweighted average of unrelated quantities; "VERIFIED 100%" is displayed regardless.

---

## 3. Role-by-role inventory

| Capability | Admin | Faculty | Student |
|---|---|---|---|
| Login | ✅ (bypassable) | ✅ (bypassable) | ✅ (bypassable) |
| Dashboard (global KPIs, charts) | ✅ | ✅ (sees **everything**, incl. all face images) | — |
| Register users + enroll face | ✅ | — | — |
| Scanner (kiosk) | ✅ | ✅ | — (UI) / **any anonymous caller can POST attendance** |
| Records / CSV export | ✅ / ✅ | ✅ / — (UI only) | — |
| Delete all users / clear attendance | ✅ / ✅ | — / **✅ (server allows faculty to wipe all attendance)** | — |
| Own history | — | — | ✅ (rate fabricated) |
| Other students' history | — | — | **✅ (IDOR: `/attendance/student/:id` only checks login)** |
| Corrections, classes, audit log | ❌ | ❌ | ❌ |

---

## 4. Prioritized issues

### P0 — security / integrity (exploitable today)

| # | Issue | Evidence |
|---|---|---|
| P0-1 | **Universal password backdoor.** Login succeeds if `password === "<role>@123"` for *any* user, and if the email is unknown the server picks *any* user with the submitted role. `{"email":"x","role":"admin","password":"admin@123"}` → admin JWT. | `server/controllers/authController.js:15-20` |
| P0-2 | **Public admin self-registration.** `POST /api/auth/register` is unauthenticated and accepts `role`. | `authRoutes.js:7`, `authController.js:53-62` |
| P0-3 | **Unauthenticated attendance forgery.** `POST /api/attendance` and `/mark` have no auth; `userId`, `name`, `role`, `date`, `confidenceScore`, `riskLevel` are all client-controlled. Anyone can mark anyone present for any date at LOW risk. | `attendanceRoutes.js:6-10`, `attendanceController.js:4-45` |
| P0-4 | **Unauthenticated behavior-profile tampering.** `PUT /api/users/:id/update-behavior` has no auth and accepts an arbitrary `adaptiveThreshold`. | `userRoutes.js:16` |
| P0-5 | **Default credentials re-seeded on every boot** (`admin@frams.edu / admin@123`, etc.). | `server/config/db.js:9-27` |
| P0-6 | **Secrets committed to git.** `server/.env` (`MONGO_URI`, `JWT_SECRET`) is tracked since the first commit and present on the public remote. Rotation is required and is an owner action. | `git log -- server/.env` → `49664ef` |
| P0-7 | **Bulk biometric exposure.** `GET /api/users` (faculty) returns every user's 128-D `faceDescriptor` and base64 `faceImage`; the Scanner downloads all of them to the browser. | `userController.js:4-7`, `Scanner.jsx:97` |
| P0-8 | **Client-trusted verification.** The server never checks the face match; confidence, liveness and risk are client claims. | `attendanceController.js` |
| P0-9 | **Frontend auth bypass.** In DEMO_SAFE_MODE (on by default), if the backend is unreachable/erroring, `role + "<role>@123"` yields a fake authenticated session. | `api.js:47-68`, `App.jsx:21` |

### P1 — correctness / reliability / privacy

| # | Issue | Evidence |
|---|---|---|
| P1-1 | IDOR on `GET /attendance/student/:id`; errors swallowed as `[]`. | `attendanceController.js:84-92` |
| P1-2 | Faculty can `DELETE /attendance/clear` (wipe all records); no audit trail for destructive ops. | `attendanceRoutes.js:12` |
| P1-3 | No unique index on `(userId, date)` → duplicate attendance possible under concurrency; dedupe is a non-atomic read-then-write. | `Attendance.js`, `attendanceController.js:21` |
| P1-4 | `date` uses UTC (`toISOString`) on client while `time` uses local clock → wrong day near midnight for non-UTC users (e.g. IST before 05:30). | `Scanner.jsx:658-659` |
| P1-5 | `protect` middleware crashes on a deleted user (`req.user.email` of null) and logs every request's email. | `authMiddleware.js:11-12` |
| P1-6 | Silent failure: offline "success" toasts for attendance that was never stored. | `api.js:33-39` |
| P1-7 | No input validation (types/ranges) on any endpoint; 50 MB JSON body limit; CORS `*`; no rate limiting on login. | `server.js:17-26` |
| P1-8 | JWT 30-day expiry stored in `localStorage` (XSS-exfiltratable); no logout invalidation. | `authController.js:5`, `AuthContext.jsx:57` |
| P1-9 | API base URL hardcoded to `http://localhost:5000` — deployed frontend cannot reach a backend. | `api.js:4` |
| P1-10 | Webcam stream leak in Register: cleanup closes over initial `stream = null`. | `Register.jsx:21-43` |
| P1-11 | Scanner closure bug: `processSecurityStats` reads `matcher`/`registeredUsers` from the render where the loop started (stale state). | `Scanner.jsx:200-251` |
| P1-12 | Hardcoded/fabricated student metrics (see §2). | `StudentDashboard.jsx:45` |
| P1-13 | Faces are labeled "SPOOF" / "SUSPICIOUS" to end users on weak heuristics; HIGH risk increments a permanent `anomalyCount` with no review path. | `Scanner.jsx:608`, `attendanceController.js:57-59` |

### P2 — maintainability / UX / performance

- No tests at all (`server/package.json` test script is a stub). No CI.
- Lint: **116 problems (111 errors, 5 warnings)**; the majority are Node/CommonJS scripts (`server/**`, root `*.js`) linted with browser globals — a config gap, plus ~10 real unused-var / hook-dep issues in `src/`.
- 1.43 MB single JS chunk (face-api + recharts + app), no code splitting.
- Styling: ~600 lines of global CSS + pervasive inline `style={{…}}`; no tokens; references Tailwind-like classes (`w-16`, `animate-spin`, `text-arc-blue`) with **no Tailwind installed**, so they render unstyled.
- Imperative DOM writes from the render loop via `document.getElementById` (`Scanner.jsx:567-603`).
- Layout uses fixed grids (`1fr 340px`, `minmax(400px,1fr)`) → broken on mobile.
- Root contains ad-hoc scripts (`check_db.js`, `fix_index.js`, `verify_fix.js`, `build_err*.txt`) and unrelated agent tooling (`.agent/`, `.gsd/`, `adapters/`).
- `server/LMS.py` is unrelated to the Node backend.

---

## 5. Baseline (executed 2026-10-11)

| Check | Command | Result |
|---|---|---|
| Lint | `npx eslint .` | ❌ exit 1 — 116 problems (111 errors, 5 warnings) — **pre-existing** |
| Build | `npx vite build --outDir <temp>` | ✅ exit 0 — 1,433 kB JS (391 kB gzip), chunk-size warning, `fs` externalized warning from face-api |
| Unit / integration tests | — | None exist |
| Backend start | — | Not run: `MONGO_URI` targets a local MongoDB that is not installed on this machine |
| Browser / visual checks | — | Not run at audit time |

---

## 6. Proposed direction

### Architecture (keep the stack: React + Vite + Express + Mongo + face-api.js)
1. **Server-side identity decision.** New `POST /api/verify` (faculty/admin kiosk session): client sends the 128-D descriptor plus client-reported liveness signals; the server matches against stored descriptors, applies thresholds, computes risk with the *existing* rule set (moved server-side, unchanged boundaries), enforces one record per user per day atomically, and returns a structured, stage-by-stage result. The browser never receives other users' descriptors or images. Liveness is labelled honestly as **client-reported evidence**.
2. **Auth hardening**: remove backdoors and role-fallback login, lock `register`, seed defaults only when explicitly enabled by env, require auth on every mutating route, ownership check on student history.
3. **Integrity**: unique `(userId, date)` index (non-destructive; build after checking duplicates), input validation, rate limiting on login, CORS allow-list, smaller body limit, audit log collection for privileged/destructive actions.
4. **Review path instead of punishment**: uncertain matches / HIGH risk create a record flagged `needs_review`, visible in an anomaly queue where faculty/admin record a human decision. Model signal, observed fact and human decision are stored separately.
5. **Student corrections**: `correctionRequests` — student submits, faculty/admin resolves, audited.

### Design ("The Trust Instrument")
Token-based design system (`src/styles/tokens.css`) — graphite/obsidian surfaces, a single restrained cyan accent, semantic success/warn/danger/neutral, one type scale, visible focus rings, reduced-motion support; shared primitives (Button, Card, Badge/StatusPill, Table, Field, Dialog, EmptyState, PageHeader). Replace the movie-HUD vocabulary ("J.A.R.V.I.S", "SPOOF", "heat signatures") with precise, calm language. The verification workspace becomes a six-stage stepper driven by real state: Camera → Face quality → Liveness signals → Identity match → Risk → Decision.

### Sequence
A audit (this doc) → **E-first security slice** (P0 fixes + tests; the redesign must not sit on a forgeable API) → B tokens/primitives → C shell, login, verification journey, role dashboards → D anomaly queue, corrections, audit log → F full verification.
Reason for reordering E ahead of B/C: the verification UI must reflect server decisions, and those endpoints do not exist yet.

---

## 7. Security & privacy items requiring owner action

- **Rotate `JWT_SECRET` and any database credentials** that were ever in `server/.env`; remove `.env` from tracking (`git rm --cached`) and add to `.gitignore`. History rewrite to purge it is a separate, owner-approved decision.
- Decide retention policy for `faceImage` snapshots (currently stored indefinitely as base64 in the user document).
- Consent text at enrollment; deletion of biometric data when a user is removed (currently deletion removes the user doc, attendance rows remain with the name).
- Do not describe blink/motion checks as anti-spoofing. They are replayable by a video.
