# Security policy

## Reporting a vulnerability

Email security reports to the maintainers of this repository. Do not open a public GitHub issue for a vulnerability, and do not include live credentials in the report.

Please describe the affected component, the impact, and a way to reproduce it. You should hear back within a few days.

## Supported tree

Security fixes apply to the default branch of this repository. Release tags older than the default branch are not a supported place to keep secrets or patches.

## What does not belong in this repository

- Passwords, API keys, tokens, or connection strings
- Private customer or operator evidence
- Internal plans, pricing, or sales notes
- Agent transcripts (`.cursor/`, `.claude/`, `*.chat.md`)

Generate `JWT_SECRET` and `ENCRYPTION_KEY` locally. The application does not ship a usable default for either value.
