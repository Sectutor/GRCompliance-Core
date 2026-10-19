# Contributing to GRCompliance

Thanks for helping improve GRCompliance. The public repository is the open-source product. Internal plans, customer evidence, and credentials stay out of it.

## Setup

Follow [INSTALL.md](INSTALL.md). Then:

```bash
git checkout -b feature/short-description
git config core.hooksPath .githooks
```

The app lives in npm workspaces:

- `packages/core` is the application
- `packages/ui` is the shared interface kit
- `packages/plugin-sdk` and `packages/plugins` are the plugin surface
- `packages/landing` is the public site

## Pull requests

- Keep each request to one change
- Run `npm test` and `npm run build -w @complianceos/core` when you touch application code
- Do not add `.env` files, uploads, build output, or one-off database scripts
- Do not add paths under `.cursor/`, `.claude/`, `plans/`, `notes/`, or `internal/`, and do not add `*.chat.md`

CI rejects those paths and fails on gitleaks findings in the tree you push.

## License

By contributing, you agree that your contributions are licensed under the GNU Affero General Public License v3.0, the same license as the rest of GRCompliance. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
