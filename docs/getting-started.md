# Getting started with GRCompliance

Install and run the app with [INSTALL.md](../INSTALL.md). This page is the short map of what you do after clone.

## Configure

Copy `.env.example` to `.env`. Fill in your own database URL and generate your own `JWT_SECRET` and `ENCRYPTION_KEY`. Leave every secret out of git.

## Database

```bash
npm run db:push
```

That applies the Drizzle schema to the database named by `DATABASE_URL`.

## Run

```bash
npm run server
npm run dev
```

The API defaults to port 3001. The web app defaults to port 5173.

## Develop

- `npm test` runs Vitest
- `npm run build -w @complianceos/core` builds the app
- [Architecture](./architecture.md) and the [API reference](./api-reference.md) describe the tree
