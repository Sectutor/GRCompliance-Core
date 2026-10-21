# Client truth files

One truth file per client. It is the source the monthly readiness report and the other CaaS checks are allowed to quote. The human template is the uploaded truth-file outline: identity, NIS2 class, frameworks, scope, assets, suppliers, control owners, evidence, risks, contacts, findings, decisions, approved facts, engagement, regulatory watch, and change history.

The machine-readable format is YAML or JSON. The JSON Schema is [`packages/core/src/lib/truthFile/truth-file.schema.json`](../packages/core/src/lib/truthFile/truth-file.schema.json). [`truth-files/latore-ltd.yaml`](latore-ltd.yaml) is the Latore LTD demo. It uses the demo seed and the template only. Company number, VAT, and registered address are `to be added` because the seed does not contain them. Prices are `PRICE TBD (owner)` unless they are listed under `shared_facts.approved_prices`.

Do not put passwords, API keys, tokens, connection strings, or `.env` contents in a truth file. Point at the vault instead.

## Check a file

From the repository root:

```bash
npm run truth:validate
npx tsx scripts/truth-file/validate.ts truth-files/latore-ltd.yaml
```

The checker fails the file when:

- a required header or section field is missing
- a date is not a real calendar date, or dates are out of order (for example an evidence row collected after its refresh date, or a change-history date after `last_reviewed`)
- `frameworks` or the NIS2 class, sector, or annex is outside the allowed list
- an approved fact has no named owner
- a framework applies or is in scope but is missing from `frameworks`
- an asset or supplier names an entity that is not defined
- an Annex A control id is not in the ISO/IEC 27001:2022 set (A.5, A.6, A.7, A.8)
- the NIS2 class has no rationale and no decision-log entry
- a string looks like a secret
- a price is neither `PRICE TBD (owner)` nor an approved shared fact

Allowed NIS2 classes are `essential`, `important`, `out_of_scope`, and `pending`. Sectors are the NIS2 Annex I and Annex II activities (`energy`, `transport`, `banking`, `financial_market_infrastructure`, `health`, `drinking_water`, `waste_water`, `digital_infrastructure`, `ict_service_management`, `public_administration`, `space`, `postal_and_courier`, `waste_management`, `chemicals`, `food`, `manufacturing`, `digital_providers`, `research`) plus `pending` and `out_of_scope`. Annex values are `annex_i`, `annex_ii`, `zks_annex_1`, `zks_annex_2`, `pending`, and `out_of_scope`.

Allowed framework ids are `ISO27001:2022`, `NIS2` (alias `NIS2/ЗКС`), `SOC2`, `GDPR`, `DORA`, and `CRA`.

## Compare with a workspace

The app stores the same client's frameworks on the controls assigned to the workspace, and its scope on `risk_settings.scope` (and on a gap assessment when that scope column is filled). The optional comparison reads those rows, plus gap control ids, remediation-plan titles, business-process names, and risk scores with their stored labels. It prints differences and does not write.

```bash
npx tsx scripts/truth-file/validate.ts truth-files/latore-ltd.yaml --client-name "Latore LTD"
```

`--client-id` selects by numeric workspace id. This needs `DATABASE_URL`. Exit code 2 means the file is valid and the workspace differs. The check is not part of the GitHub Actions job, because CI has no database.

Framework names are normalised (`ISO 27001` and `ISO27001:2022` are the same id). A control id, roadmap title, business-process name, or risk label that is in the workspace but not approved in the truth file is reported. Risk labels are compared with the bands declared in the truth file (1–3 Low, 4–7 Medium, 8–14 High, 15–19 Very High, 20–25 Critical), not with whatever text the seed stored.

`npm test -w @complianceos/core -- src/lib/truthFile/validate.test.ts` covers the Latore file and these rules.

The monthly readiness PDF quotes a valid truth file when one is configured for the workspace, or when `truth-files/<workspace-name>.yaml` exists. A file that fails validation is not quoted. The report lists workspace differences in an annex and does not email the PDF. See the root README for the scheduler, which is off unless `ENABLE_MONTHLY_READINESS_SCHEDULER=true` and the workspace opts in.
