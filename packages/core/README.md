# GRCompliance core

Open-source application package for GRCompliance.

## Run

From the repository root, follow [INSTALL.md](../../INSTALL.md).

```bash
npm install
cp .env.example .env
npm run dev
npm run server
```

Set `DATABASE_URL` to your own PostgreSQL database. Set `JWT_SECRET` and `ENCRYPTION_KEY` yourself. This package does not contain a usable default for either value.

## Layout

- `src/` is the application
- `drizzle/` and `migrations/` are the schema

## License

GNU Affero General Public License v3.0 only (SPDX `AGPL-3.0-only`). See the repository [LICENSE](../../LICENSE).
