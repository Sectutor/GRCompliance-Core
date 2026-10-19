# GRCompliance

Open-source core for governance, risk, and compliance.

[![License: AGPLv3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

GRCompliance helps a team run controls, policies, risk, evidence, vendors, and audits in one self-hosted application. Framework content shipped in this repository includes ISO 27001, SOC 2, HIPAA, PCI DSS, NIST, and GDPR material.

## Run it

Requirements: Node.js 20+, npm, and PostgreSQL 15+.

```bash
git clone https://github.com/Sectutor/ComplianceOS-Core.git
cd ComplianceOS-Core
npm install
cp .env.example .env
npm run db:push
npm run server
npm run dev
```

Open `http://localhost:5173`. The full steps, including the secrets you must generate yourself, are in [INSTALL.md](INSTALL.md).

## Repository map

- `packages/core` is the application
- `packages/ui` is the shared interface kit
- `packages/plugin-sdk` and `packages/plugins` are the plugin surface
- `packages/landing` is the public site
- `docs/` is the public documentation

## Documentation

- [Install](INSTALL.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Docs index](docs/README.md)

## License

GRCompliance is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

A commercial license is available for organizations that need terms other than AGPLv3. The template is [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md). Pricing is not published in this repository. Write to sales@grcompliance.com.

If you modify GRCompliance and offer it as a network service, AGPLv3 requires you to offer the corresponding source to users of that service.
