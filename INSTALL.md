# Install GRCompliance

GRCompliance is the open-source core for governance, risk, and compliance. This page is the supported way to run it locally.

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

Apply the schema and start the app:

```bash
npm run db:push
npm run server
npm run dev
```

The API listens on port 3001 by default. The web app listens on port 5173.

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

The pre-commit hook rejects internal-doc paths and runs gitleaks on staged changes when gitleaks is installed. CI runs the same checks.

## Next

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Documentation index](docs/README.md)
