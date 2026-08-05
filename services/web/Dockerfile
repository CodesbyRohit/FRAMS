# ── ANIMA Web (Next.js) ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/web/package.json services/web/package.json
RUN npm install --workspace @anima/web --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/packages/shared/package.json packages/shared/package.json
COPY --from=deps /repo/services/web/package.json services/web/package.json
COPY packages packages
COPY services/web services/web
RUN npm run build --workspace @anima/web

FROM node:22-alpine AS runtime
WORKDIR /repo/services/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/services/web/.next ./.next
COPY --from=build /repo/services/web/public ./public
COPY --from=build /repo/services/web/package.json ./package.json
COPY --from=build /repo/services/web/node_modules ./node_modules
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/services/web/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["npm", "run", "start"]
