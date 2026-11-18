# GRCompliance

Open-source, self-hosted governance, risk, and compliance. This repository is Core. Premium is a paid edition you run on your own host, and it is not open source.

[![CI](https://github.com/Sectutor/GRCompliance-Core/actions/workflows/ci.yml/badge.svg)](https://github.com/Sectutor/GRCompliance-Core/actions/workflows/ci.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)
[![Container image](https://img.shields.io/badge/ghcr.io-grcompliance--core-2496ED)](https://github.com/Sectutor/GRCompliance-Core/pkgs/container/grcompliance-core)

Project site: [grcompliance.com](https://grcompliance.com/).

The demo at [demo.grcompliance.com](https://demo.grcompliance.com) is a public sample instance. Data there may be reset.

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

Docker and the Docker Compose plugin are required. The installer creates `~/grcompliance`, writes a private `.env`, and starts the containers. Windows, a custom address, and a manual Compose install are below.

Core keeps a control library, a risk register, policies, evidence linked to controls, and an audit workspace in one place. Optional model calls stay in Core and run only after an administrator stores a provider key in the app. The service supports OpenAI, Anthropic, and Google Gemini.

## Frameworks

A fresh install does not show a four-framework list. `packages/core/src/data/frameworks/index.ts` exports 27 catalogue names. Frameworks Library keeps the entries that leave `isObligation` unset (`packages/core/src/pages/FrameworksDashboard.tsx`). That is 14 cards. The other 13 set `isObligation: true` and appear on Compliance Obligations (`packages/core/src/pages/RegulationsDashboard.tsx`). None of the 27 are Premium-only. Which control text is bundled is recorded in [docs/framework-licensing.md](docs/framework-licensing.md).

Frameworks Library, in catalogue order:

1. CIS Controls v8
2. CSA CCM v4
3. Cyber Essentials / Plus
4. NIST AI RMF
5. OWASP AISVS (AI Security)
6. OWASP ASVS (App Security)
7. OWASP MASVS (Mobile Security)
8. OWASP SAMM (Maturity Model)
9. OWASP API Security Top 10
10. OWASP Web Top 10
11. OWASP Web Top 10 (2021)
12. Australian Essential Eight
13. Secure Controls Framework (SCF)
14. OWASP ML Security Top 10

CSA CCM v4 has no catalogue file under `packages/core/src/data/frameworks/`. Secure Controls Framework (SCF) sets `contentPolicy` to `bring-your-own`.

Compliance Obligations, in catalogue order:

1. ISO 27001:2022
2. ISO 22301:2019
3. HITRUST-Aligned (Representative)
4. SOC 2 Type II
5. NIST CSF 2.0
6. NIST SP 800-171 r2
7. PCI DSS v4.0.1
8. NIST SP 800-53 Rev 5
9. FedRAMP Moderate
10. CMMC 2.0
11. SOC 1 Type II
12. TISAX
13. NIST SP 800-161

CMMC 2.0 is a catalogue description only. SOC 1 Type II and TISAX set `contentPolicy` to `bring-your-own`.

The same obligations page also lists 15 regulations from `export const regulations` in `packages/core/src/data/regulations/index.ts`: UK GDPR, VCDPA, CPA, CTDPA, UCPA, HIPAA, COPPA, GLBA, ISO/IEC 27701, ISO/IEC 29100, PIPEDA, LGPD, APPI, Australia Privacy Act 1988 & APPs, and Architectural Privacy Standards. Source files for GDPR, the EU NIS2 Directive, EU DORA, CCPA / CPRA, and the EU AI Act exist in that folder and are not imported there, so the page does not show them.

## Install

Commands match `install.sh`, `install.ps1`, `docker-compose.yml`, `docker-compose.local-ports.yml`, `.env.example`, and [INSTALL.md](INSTALL.md).

### Prerequisites

For the container install:

- Docker, with the daemon running
- The Docker Compose plugin (`docker compose`)
- `curl`
- `openssl` on Linux and macOS (the shell installer uses it to generate secrets)
- `git` only when the published image cannot be pulled and the installer builds from a clone

On Windows, use Docker Desktop and PowerShell. `install.ps1` generates secrets with the Windows cryptography API. It exits before it writes secrets when it is not running on Windows.

A Node checkout needs Node.js 20 or newer, npm, PostgreSQL 15 or newer, and git. The container database image is `pgvector/pgvector:pg16`. Redis in Compose is `redis:7-alpine` and starts with a password.

### Linux and macOS

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

Publish Postgres and Redis on `127.0.0.1` only when a host client needs them. The default leaves both on the Compose network.

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --bind-local
```

Choose another directory with `--dir` or `GRC_HOME`:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --dir /opt/grcompliance
```

The installer writes `APP_URL` into `.env`. The app uses that address for sign-in and for links. Set it to the address you will open in the browser before the first install. If `APP_URL` is unset, the installer reads `PUBLIC_URL`, then `http://localhost:` plus `APP_PORT` (3001 unless you change it).

```bash
export APP_URL=https://grc.example.com
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash
```

`APP_URL` must be an absolute `http` or `https` URL for this instance. The installer refuses a host of `grcompliance.com` or any subdomain of it.

When `/health` returns HTTP 200, the installer prints that address. It prints the administrator password once, while it writes `.env` (mode 600). The administrator email is `admin@grcompliance.local` unless you set `ADMIN_EMAIL`. When `AUTH_MODE` is `local`, the first start seeds a sample workspace. If `/health` is still failing after the retries, the installer exits non-zero and prints `docker compose logs` hints. `HEALTH_RETRIES` changes the attempt count (default 90, five seconds apart).

Running the installer again keeps the existing `.env`, database, and uploaded files.

### Windows

```powershell
irm https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.ps1 | iex
```

```powershell
$env:APP_URL = "https://grc.example.com"
irm https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.ps1 | iex
```

`-BindLocal` publishes Postgres and Redis on `127.0.0.1` only.

### Manual Docker Compose install

Use this when you already have a clone and want to build the image yourself. `docker-compose.yml` loads `updater-state/release.env` as an `env_file`, and Compose fails if that path is missing. The clone already includes it. The committed file is a comment and holds no secrets. Leave it in place. A button upgrade writes `GRC_VERSION`, `GRC_IMAGE`, and `GRC_IMAGE_DIGEST` into it. The installer creates an empty file only when the path is missing.

```bash
git clone https://github.com/Sectutor/GRCompliance-Core.git
cd GRCompliance-Core
cp .env.example .env
chmod 600 .env
```

Replace every `replace-with-openssl-rand-hex` value. Generate each one with `openssl rand -hex 32` and keep it in `.env` only. `DATABASE_URL` must use the Compose service name `db` and `sslmode=disable` for the bundled Postgres.

```bash
docker compose up -d --build
```

The app container listens on port 3001. The host port is `APP_PORT` (3001 when unset). Postgres and Redis are not published. To bind them to `127.0.0.1` only:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-ports.yml up -d --build
```

To change `APP_URL` after the first install, edit `.env` and start the stack again from that directory:

```bash
docker compose up -d
```

### Node checkout

[INSTALL.md](INSTALL.md) is the path for a Node checkout.

```bash
git clone https://github.com/Sectutor/GRCompliance-Core.git
cd GRCompliance-Core
npm install
cp .env.example .env
```

Set `DATABASE_URL` to your own PostgreSQL instance. Generate `JWT_SECRET` and `ENCRYPTION_KEY` yourself. Leave the Supabase variables unset when `AUTH_MODE` is `local`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` only when you bring your own Supabase project.

```bash
npm run db:push
```

Run the API and the web app in two terminals. `packages/core/vite.config.ts` does not set a port, so `npm run dev` listens on Vite's default, 5173, and proxies `/api` to `http://127.0.0.1:3002`. `server_entry.ts` listens on `PORT`, and on 3002 when `PORT` is unset. `.env.example` sets `PORT=3001` for the container. Start the API with `PORT=3002` so that value wins over the file and the proxy can reach it.

```bash
PORT=3002 npm run server
npm run dev
```

## Environment variables

Names below are the ones a Compose install sets. [`.env.example`](.env.example) also names `PORT`, `CORS_ORIGIN`, rate-limit settings, Supabase settings, and optional integration keys. Values stay in your own `.env`.

| Name | Purpose |
| --- | --- |
| `POSTGRES_USER` | Database role. Default `grc`. |
| `POSTGRES_PASSWORD` | Database password. The installer generates it. |
| `POSTGRES_DB` | Database name. Default `grcompliance`. |
| `DATABASE_URL` | Connection string the app uses. For the bundled Postgres it must include the host `db` and `sslmode=disable`. |
| `DATABASE_SSL` | `false` for the bundled Postgres container. |
| `REDIS_PASSWORD` | Redis password. Redis refuses connections that omit it. |
| `JWT_SECRET` | Signs local session tokens. |
| `ENCRYPTION_KEY` | Encrypts sensitive values at rest. |
| `ADMIN_EMAIL` | First administrator. Default `admin@grcompliance.local`. |
| `ADMIN_PASSWORD` | First administrator password. Applied only when that account is created. |
| `APP_URL` | Address this instance accepts for sign-in and uses in links. |
| `APP_PORT` | Host port mapped to the app container. Default 3001. |
| `GRC_VERSION` | Image tag used when `GRC_IMAGE` is unset. `latest`, or a release tag. |
| `GRC_IMAGE` | Optional pin written by the updater: image name, tag, and digest. |
| `GRC_UPDATER_VERSION` | Updater image tag. Default `1`. |
| `GRC_AIRGAP` | Set to `1` to disable the update button and refuse pulls. |
| `UPDATER_SECRET` | Shared by the app and the updater sidecar. The app container does not receive the Docker socket. |
| `AUTH_MODE` | `local` for the bundled login. `supabase` when you bring your own Supabase project. |
| `GRC_COOKIE_CONSENT` | Set to `1` to show an optional in-browser preference notice. Default off. The app does not load advertising or analytics scripts. |
| `POSTGRES_HOST_PORT` | Loopback port for Postgres when `--bind-local` or the local-ports file is used. Default 5432. |
| `REDIS_HOST_PORT` | Loopback port for Redis in that same case. Default 6379. |
| `VITE_ENABLE_PREMIUM` | Exact `true` may show premium menu entries in the browser. It does not authorize premium APIs. |

`OPENAI_API_KEY` is named in `.env.example`. The model service reads provider keys stored in the database, not that variable. `SENDGRID_API_KEY` is read by the mailer when you set it. Leave every optional key empty unless you set it from your own secret store.

Installer-only variables, not keys in `.env.example`: `PUBLIC_URL`, `HEALTH_RETRIES`, `GRC_HOME`, and `GRC_BIND_LOCAL`.

## First login

Wait until `/health` returns HTTP 200, then open the address in `APP_URL`. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The installer prints the password once and does not print it again. The bootstrap creates that administrator with role `admin` and stores the password only when the account is first created. When `AUTH_MODE` is `local`, that same first start seeds a sample workspace.

`AUTH_MODE=local` uses that local account. It does not call Supabase. Invited people who set a password, and an administrator password reset, are stored in `local_credentials`.

## Upgrade

An administrator opens **Settings → Updates**. When a newer Core release exists, the button says **Update available → Upgrade now**. The updater backs up Postgres and uploaded files before it replaces the app image, and it rolls back if the new app does not become healthy.

The manual command does not take that backup. Back up first, then:

```bash
curl -fsSL https://raw.githubusercontent.com/Sectutor/GRCompliance-Core/main/install.sh | bash -s -- --upgrade
```

Operator steps, schema handling, and rollback are in [Upgrade](docs/UPGRADE.md).

## Backup

Back up the Postgres database `grcompliance` and the uploaded files on the `grc_uploads` volume together. `scripts/backup.sh` and `scripts/restore.sh` do that and record SHA-256 checksums. Redis on `grc_redis` is a cache. The pre-upgrade copies written by the updater live on `grc_backups`.

See [Backup and restore](docs/BACKUP-RESTORE.md).

## Community and Premium

Community is the default. Premium server APIs stay forbidden until the paid edition registers a server entitlement provider at boot (`registerPremiumEntitlement` in `packages/core/src/server/premiumEntitlement.ts`). `VITE_ENABLE_PREMIUM`, `BUILD_TYPE`, a licence key string, `INSTANCE_LICENSE_TIER`, a platform administrator, a workspace owner, and a client admin do not authorize those APIs. The published image is Community.

Capabilities named in `packages/core/src/lib/upgradeCopy.ts`:

- MCP
- Automatic evidence collection, including API evidence ingest
- Integrations for GitHub, SIEM, SOAR, threat intel, and vulnerability scanners
- Prowler and Trivy scanner add-ons
- Multilingual support

The Community menu hides these entries. They are marked premium in `packages/core/src/components/DashboardLayout.tsx`. Setting `VITE_ENABLE_PREMIUM` to the exact value `true` can show them in the browser. That flag does not authorize the server.

- Workbench
- Adversary Intelligence
- Vulnerability Workbench
- AI Governance
- Threat Modeling
- CRM Dashboard
- Advisor Workbench

Controls, the governance dashboard, the risk register, policies, and evidence stay in the menu.

A Community instance can keep the seeded sample workspace and one other workspace. The sample workspace does not consume that one workspace. The server enforces the cap when you create or switch workspaces. Existing rows are left in place. `VITE_ENABLE_PREMIUM`, a client-supplied plan, and `users.maxClients` do not raise the cap.

Activating a Premium licence key in the app is what changes that workspace's plan. Putting a licence key in the environment, or writing the plan from the client, does not. The workspace cap does not follow the plan. **Settings → Updates** replaces the Core image only. It does not raise the cap and it does not register a premium entitlement.

The first page does not show a consent dialog. Set `GRC_COOKIE_CONSENT=1` only if you want an optional notice that records a browser preference and still loads no third-party scripts.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). Do not commit `.env` files, credentials, or customer evidence.

## License

GRCompliance Core is licensed under the GNU Affero General Public License version 3.0 only (AGPL-3.0-only). Copyright is held by GRCompliance contributors. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

If you modify GRCompliance and offer it as a network service, AGPL-3.0-only requires you to offer the corresponding source to users of that service.

Organizations that need terms other than AGPL-3.0-only can use the commercial template in [commercial-agreement.md](commercial-agreement.md). Write to sales@grcompliance.com or legal@grcompliance.com.

Source checkout: [https://github.com/Sectutor/GRCompliance-Core.git](https://github.com/Sectutor/GRCompliance-Core.git).
