# Updater sidecar. This is the only service that receives the Docker socket.
FROM docker.io/library/node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/*

ARG DOCKER_VERSION=27.3.1
ARG COMPOSE_VERSION=2.32.4
RUN arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) docker_arch=x86_64; compose_arch=x86_64 ;; \
         arm64) docker_arch=aarch64; compose_arch=aarch64 ;; \
         *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-${DOCKER_VERSION}.tgz" -o /tmp/docker.tgz \
    && tar -xzf /tmp/docker.tgz -C /tmp \
    && install -m 0755 /tmp/docker/docker /usr/local/bin/docker \
    && mkdir -p /usr/local/lib/docker/cli-plugins /usr/libexec/docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${compose_arch}" \
         -o /usr/local/lib/docker/cli-plugins/docker-compose \
    && cp /usr/local/lib/docker/cli-plugins/docker-compose /usr/libexec/docker/cli-plugins/docker-compose \
    && chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose /usr/libexec/docker/cli-plugins/docker-compose \
    && rm -rf /tmp/docker /tmp/docker.tgz \
    && docker --version \
    && docker compose version

WORKDIR /opt/updater
COPY updater/src /opt/updater/src

ENV NODE_ENV=production
ENV UPDATER_PORT=9090

EXPOSE 9090

LABEL org.opencontainers.image.title="GRCompliance Core updater" \
      org.opencontainers.image.description="Admin-triggered updater sidecar for GRCompliance Core" \
      org.opencontainers.image.source="https://github.com/Sectutor/GRCompliance-Core" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=10 \
    CMD node -e "fetch('http://127.0.0.1:9090/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER root
CMD ["node", "/opt/updater/src/index.mjs"]
