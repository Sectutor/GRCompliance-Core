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

## Edition

This repository is the Community edition. Premium procedures (CRM, federal, threat models, questionnaire generation, vendor modules, and the other routers wrapped by `requirePremiumEdition`) return forbidden until the paid edition registers a server entitlement at boot. `npm run server:enterprise` and `npm run server:trial` start that same Community server. They do not unlock those APIs. `VITE_ENABLE_PREMIUM=true` can show premium navigation in the browser and does not authorize the server.

## Develop

- `npm test` runs Vitest
- `npm run build -w @complianceos/core` builds the app
- [Architecture](./architecture.md) and the [API reference](./api-reference.md) describe the tree
