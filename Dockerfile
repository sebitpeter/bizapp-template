# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# One container = API + shop front + admin (the API serves the built site).
#   docker build -t bizapp .
#   docker run --env-file .env -p 8080:8080 bizapp
# Secrets are passed at RUN time (--env-file / hosting panel), never baked in.
# ---------------------------------------------------------------------------

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
# Install with only manifests first so this layer is cached between code changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY scripts/check-pnpm.cjs scripts/check-pnpm.cjs
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/storefront/package.json artifacts/storefront/
COPY lib/ lib/
COPY business/package.json business/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# The only package the bundle loads from node_modules is the native Argon2 hasher.
RUN echo '{"private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund @node-rs/argon2@2.2.2 \
 && npm cache clean --force
COPY --from=build /app/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=build /app/artifacts/storefront/dist/public artifacts/storefront/dist/public
COPY --from=build /app/lib/db/migrations lib/db/migrations
COPY --from=build /app/business/seed business/seed
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
