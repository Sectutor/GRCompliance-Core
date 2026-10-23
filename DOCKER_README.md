# Docker

The supported container install is the one-line installer and `docker-compose.yml` described in the [README](README.md).

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

Postgres and Redis stay on the compose network. Only the app port is published. Bind them to loopback with:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --bind-local
```

`docker-compose.local-ports.yml` is the same override. Secrets are read from `.env` and are never stored in the image. The installer exits non-zero when the app container is crash-looping or has exited, and when `/health` does not return HTTP 200. It prints a redacted log tail and `docker compose logs` hints.

Upgrade an existing directory with:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --upgrade
```

`install.ps1` is Windows-only. Linux and macOS use `install.sh`.
