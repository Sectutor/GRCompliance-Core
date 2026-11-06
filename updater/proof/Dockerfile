# Disposable versioned app image for the local upgrade proof.
# Build twice with different PROOF_* args and tag 1.0.0, 1.1.0, and 1.2.0.
FROM docker.io/library/node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY updater/proof/app.mjs /app/app.mjs

ARG PROOF_VERSION=1.0.0
ARG PROOF_SCHEMA=1
ARG PROOF_FAIL=0
ENV PROOF_VERSION=$PROOF_VERSION
ENV PROOF_SCHEMA=$PROOF_SCHEMA
ENV PROOF_FAIL=$PROOF_FAIL
ENV PORT=3001

EXPOSE 3001
CMD ["node", "/app/app.mjs"]
