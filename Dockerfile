# Community edition image. Secrets are supplied at runtime, never baked in.
FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY packages/landing/package.json packages/landing/package.json

RUN npm ci

FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV CI=true
ENV BUILD_TYPE=AGPLv3
ENV VITE_ENABLE_PREMIUM=false
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run build -w @complianceos/core

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV BUILD_TYPE=AGPLv3
ENV VITE_ENABLE_PREMIUM=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 grc \
    && useradd --system --uid 1001 --gid grc --create-home --home-dir /home/grc grc

COPY --from=builder --chown=grc:grc /app /app

RUN mkdir -p /app/uploads && chown grc:grc /app/uploads \
    && chmod 755 /app/docker/entrypoint.sh

USER grc

EXPOSE 3001

LABEL org.opencontainers.image.title="GRCompliance Core" \
      org.opencontainers.image.description="Open-source GRC and compliance platform" \
      org.opencontainers.image.url="https://grcompliance.com/" \
      org.opencontainers.image.source="https://github.com/Sectutor/GRCompliance-Core" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --retries=12 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker/entrypoint.sh"]
