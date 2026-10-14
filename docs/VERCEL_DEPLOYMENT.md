# ANIMA — Vercel Deployment Report

**Scope:** `services/web` (Next.js 15 App Router, React 19, TypeScript 5.5, Apollo Client, Three.js)
**Status:** ✅ Production build green — 0 errors, 0 warnings, 10/10 static routes
**Validated:** `next build` (fresh cache) · `tsc --noEmit` · `eslint .` — all exit 0

---

## 1. No ESLint configuration → unpredictable/blocked builds

| | |
|---|---|
| **Original issue** | The web app had no ESLint config and no ESLint toolchain. Next.js 15 runs a linter during `next build`; without a config the build is fragile, and any lint error that is introduced later becomes a deployment blocker. No editor/CI lint feedback existed. |
| **Root cause** | `eslint`, `eslint-config-next`, and a flat config (`eslint.config.mjs`) were never scaffolded when the app was created. |
| **Solution** | Added the full ESLint toolchain and a Next.js flat config (`next/core-web-vitals` + `next/typescript`). Ran `eslint .` and fixed the one violation (unused helper). The build-time linter and the editor now share identical rules. |
| **Files modified** | `services/web/eslint.config.mjs` (new) · `services/web/package.json` · `services/web/lib/webauthn.ts` · `package-lock.json` |

## 2. Node.js version not pinned for Vercel

| | |
|---|---|
| **Original issue** | The runtime Node version was left to whatever Vercel happened to provision; local tooling ran Node 24. A mismatch can surface as flaky native builds or CI drift. |
| **Root cause** | No `engines` field on the web package and no `.nvmrc`. |
| **Solution** | Pinned `engines.node >= 20` on `@anima/web` and added `.nvmrc` (`22` — current LTS). Vercel resolves the runtime deterministically from these. |
| **Files modified** | `services/web/package.json` · `services/web/.nvmrc` (new) |

## 3. Vercel framework/root-directory ambiguity (monorepo)

| | |
|---|---|
| **Original issue** | The repo is an npm-workspaces monorepo; the Next.js app lives in `services/web`. Without explicit config, Vercel can pick the wrong root or framework preset and fail with "no Next.js app detected". |
| **Root cause** | No `vercel.json`; Vercel relies purely on auto-detection across a multi-package repo. |
| **Solution** | Added `vercel.json` in `services/web` pinning `framework: nextjs` + `buildCommand: next build`. Combined with the root `workspaces` + committed `package-lock.json`, Vercel installs at the monorepo root and builds the web app correctly. **Project setting to confirm on Vercel:** Root Directory = `services/web`. |
| **Files modified** | `services/web/vercel.json` (new) |

## 4. Missing environment template for the web app

| | |
|---|---|
| **Original issue** | `NEXT_PUBLIC_*` variables are inlined into the browser bundle **at build time**; a missing value silently wires the app to a wrong API or relies on a hardcoded fallback. |
| **Root cause** | No `.env.example` inside `services/web` documenting the contract. |
| **Solution** | Added `services/web/.env.example` documenting `NEXT_PUBLIC_API_URL`. Code already falls back to `http://localhost:4000` when unset (`lib/apollo.ts`, `app/app/memory/page.tsx`), so the build never hard-fails on env. Documented the Vercel env-var setup. |
| **Files modified** | `services/web/.env.example` (new) |

## 5. Unused, conflicting dependencies

| | |
|---|---|
| **Original issue** | `jest` + `ts-jest` were declared in the web workspace but the app has zero test files — dead weight in every install, and the root `test` script would fail against an empty suite. |
| **Root cause** | Test tooling was scaffolded into the web package but never used. |
| **Solution** | Removed `jest`/`ts-jest` and the inline jest config from `@anima/web`; updated the root `test` script to run only the API suite. Added a `lint` script. |
| **Files modified** | `services/web/package.json` · `package.json` (root) · `package-lock.json` |

## 6. Stale local build cache hanging `next build`

| | |
|---|---|
| **Original issue** | A local `next build` hung for 15+ minutes. |
| **Root cause** | Corrupted/stale `.next` incremental cache + `tsconfig.tsbuildinfo` (local-only artifact; Windows antivirus scanning made it worse). Vercel builds from a clean checkout, so this does **not** affect deployments — but it made local verification impossible. |
| **Solution** | Cleared `.next` + `tsconfig.tsbuildinfo`; verified a from-scratch build completes in ~17 s with 10/10 static routes. `.next/` and `*.tsbuildinfo` are gitignored. |
| **Files modified** | none (cache artifacts only) |

## 7. Confirmations — items reviewed and found already correct

- **Monorepo wiring** — root `workspaces` includes `services/web` + `packages/*`; `@anima/shared` resolves via `transpilePackages` and the tsconfig path alias; `outputFileTracingRoot` points at the monorepo root. ✅
- **TypeScript** — `tsc --noEmit` clean for `services/web` and `packages/shared`; strict mode on; path aliases (`@/*`, `@anima/shared`) resolve. ✅
- **API routes / middleware / server components** — the web app has no API routes or middleware (the API is the separate `services/api` NestJS service); every page compiles and prerenders as static. ✅
- **No placeholders/TODOs** — no `TODO`/`FIXME` placeholders in the web app. ✅
- **Next.js 15 defaults** — `reactStrictMode`, App Router, static prerendering of all 10 routes (landing, login, register, app shell, copilot, galaxy, memory). ✅

---

## How to deploy on Vercel

1. Import `github.com/CodesbyRohit/FRAMS` in Vercel.
2. **Framework Preset:** Next.js · **Root Directory:** `services/web` (auto-detected for this monorepo; confirm it).
3. **Node.js:** leave at the default; `.nvmrc` (22) / `engines` are respected.
4. **Environment variables** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL` → your API base URL (e.g. `https://api.anima.example`). Fallback `http://localhost:4000` is used if unset.
5. Deploy — the build runs `next build` with lint + type-checking gates, all green.

**Final validation results**

```
eslint .          → 0 problems (0 errors, 0 warnings)
tsc --noEmit      → exit 0
next build        → Compiled successfully · Linting and checking validity of types ✓
                  → 10/10 static routes (/, /login, /register, /app, /app/copilot, /app/galaxy, /app/memory, /_not-found)
```
