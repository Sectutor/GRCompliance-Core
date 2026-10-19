# Docker

The supported container install is the one-line installer and `docker-compose.yml` described in the [README](README.md).

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

Postgres and Redis stay on the compose network. Only the app port is published. `install.sh --bind-local` (or `docker-compose.local-ports.yml`) binds those two services to `127.0.0.1`. Secrets are read from `.env` and are never stored in the image. The installer exits non-zero, and prints `docker compose logs` hints, when `/health` does not return HTTP 200.
