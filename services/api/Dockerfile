# ── ANIMA API (NestJS) ──────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/api/package.json services/api/package.json
RUN npm install --workspace @anima/api --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/services/api/package.json services/api/package.json
COPY packages packages
COPY services/api services/api
RUN npm run build --workspace @anima/api

FROM node:22-alpine AS runtime
WORKDIR /repo/services/api
ENV NODE_ENV=production
COPY --from=build /repo/services/api/dist ./dist
COPY --from=build /repo/services/api/node_modules ./node_modules
COPY --from=build /repo/node_modules /repo/node_modules
EXPOSE 4000
CMD ["node", "dist/main.js"]
