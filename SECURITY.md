# Security policy

## Supported versions

Only the latest GitHub Release of this repository is supported. At the time of this file, that release is [v1.0.0](https://github.com/Sectutor/GRCompliance-Core/releases/tag/v1.0.0). When a newer release is published, support moves to that release.

Older tags are not supported. That includes the prerelease tag `Compliance`. This repository does not keep a separate security branch for older releases. Fixes are issued for the latest release.

## Reporting a vulnerability

Email the report to [emmanuel@grcompliance.com](mailto:emmanuel@grcompliance.com).

You can also use GitHub private vulnerability reporting if it is enabled for this repository. Open a public GitHub issue, pull request, or discussion only after the issue is fixed or a disclosure date is agreed.

Please include:

- The version you ran, or the git commit if you built from source
- The component that is affected
- What an attacker can do with the issue
- Steps to reproduce it, including the request or screen you used
- Whether you have already told anyone else

Leave live passwords, API keys, tokens, and customer evidence out of the report. If a proof needs a secret, say how to generate one locally.

We aim to acknowledge the report within 5 working days.

We will agree a disclosure date with you before the details are published. Please wait for a fix, or for that agreed date, before you describe the issue in public.

There is no bug bounty.

## Secrets

Generate `JWT_SECRET` and `ENCRYPTION_KEY` on the host that runs GRCompliance. Do not commit `.env` files, credentials, connection strings, or customer evidence. The application does not ship a usable default for those two keys.
