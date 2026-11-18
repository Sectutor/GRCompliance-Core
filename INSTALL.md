# Install GRCompliance

GRCompliance is the open-source core for governance, risk, and compliance.

To run it as containers, use the one-line installer in the [README](README.md):

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

This page is the supported way to run it from a Node checkout. Container installs on Linux and macOS use `install.sh`. `install.ps1` is Windows-only and exits before it writes secrets on any other operating system.

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL 15 or newer
- Git

## Install

```bash
git clone https://github.com/Sectutor/GRCompliance-Core.git
cd GRCompliance-Core
npm install
cp .env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL` to your own PostgreSQL instance
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if you use Supabase Auth
- `SUPABASE_SERVICE_ROLE_KEY` only on the server
- `JWT_SECRET` and `ENCRYPTION_KEY` to long random values you generate yourself

Do not commit `.env`. The repository ignores `.env` and every `.env.*` file except the `*.example` templates.

Apply the schema, then start the API and the web app in two terminals:

```bash
npm run db:push
PORT=3002 npm run server
npm run dev
```

The container listens on port 3001. For this Node checkout, `server_entry.ts` listens on `PORT` and on 3002 when `PORT` is unset. `.env.example` sets `PORT=3001` for the container, so start the API with `PORT=3002` (that value is not overwritten by the file). `npm run dev` listens on Vite's default port 5173 and proxies `/api` to `http://127.0.0.1:3002`.

## Checks

```bash
npm test
npm run build -w @complianceos/core
```

## Hooks

Install the repository git hooks once per clone:

```bash
git config core.hooksPath .githooks
```

The pre-commit hook rejects internal-doc paths and runs gitleaks on staged changes when gitleaks is installed. [`.pre-commit-config.yaml`](.pre-commit-config.yaml) is the same check for the pre-commit framework (`pre-commit install`). CI scans the current tree and, in git mode, only the commits added by the push or pull request.

## Container upgrade

Self-hosted containers update from **Settings → Updates**. The button says **Update available → Upgrade now** when a pinned Core release is available. The app does not get the Docker socket. Set `GRC_AIRGAP=1` to disable the button.

The manual fallback, from any directory, is:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --upgrade
```

`--upgrade` keeps `.env`, the database, and uploaded files. It does not dump the database. Back up first. The **Settings → Updates** button does take a backup, and if the new container does not become healthy the updater starts the previous image and restores that backup when the schema version changed. Operator steps are in [Upgrade](docs/UPGRADE.md). A backup of the database and uploaded files is in [Backup and restore](docs/BACKUP-RESTORE.md).

## Next

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Documentation index](docs/README.md)
