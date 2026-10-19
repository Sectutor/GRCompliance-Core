# Docker

The supported container install is the one-line installer and `docker-compose.yml` described in the [README](README.md).

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

Postgres and Redis stay on the compose network. Only the app port is published. Secrets are read from `.env` and are never stored in the image.
