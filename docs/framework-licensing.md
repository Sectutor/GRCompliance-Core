# Framework text licensing

This note records what requirement text is bundled with GRCompliance and what stays bring-your-own. The application license is AGPL-3.0-only (licensor Intellfence). Files marked CC-BY-SA below stay under that Creative Commons license. They are not relicensed to AGPL-3.0-only.

`data/frameworks/pci.ts` is unchanged. CIS Controls and CSA CCM stay user-uploaded. OWASP SCVS stays on the existing bulk-assign import path and is not a framework-list catalog in this change. Its GitHub repository is CC-BY-SA-4.0 (`OWASP/Software-Component-Verification-Standard`, branch `master`).

## Bundled

| Framework | Rows | Decision |
| --- | --- | --- |
| NIST CSF 2.0 | 106 subcategory outcomes | Public domain. Full outcome statements from NIST CSWP 29 Appendix A. https://doi.org/10.6028/NIST.CSWP.29 |
| NIST SP 800-53 Rev. 5.2.0 | 1,196 (1,014 current, 182 withdrawn) | Public domain OSCAL catalog `nist-800-53-rev5.json`. Statement text only. Withdrawn controls are seeded as inactive. The local seed updates only rows whose framework is `NIST 800-53` and whose client is empty. |
| NIST SP 800-161 Rev. 1 Update 1 | 297 identifiers from Appendix B Table 6 | Public domain. Titles come from the local 800-53 OSCAL catalog when the identifier exists there. `AT-3(6)`, `CM-8(10)`, `MA-8`, and `SR-13` use the table name because they are not in that OSCAL catalog. https://doi.org/10.6028/NIST.SP.800-161r1-upd1 |
| Essential Eight (November 2023) | 304 sentences | CC BY 4.0. © Commonwealth of Australia 2023. Sentences are from Appendices A–C. Local ids `E8-ML#-strategy-nn` are not ACSC identifiers. https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/essential-eight/essential-eight-maturity-model |
| OWASP ASVS 4.0.3 | 286 | CC BY-SA 3.0. Requirement text is the English 4.0.3 CSV, including its markdown links. `OWASP/ASVS` tag `v4.0.3` commit `719cd32389a155b7b39d8ce665faacb5fbf60473`. |
| OWASP MASVS 2.0.0 | 20 | CC BY-SA 4.0. Control and description sections from `controls/*.md`. `OWASP/masvs` tag `v2.0.0` commit `f2e668b7d5b76e22b5c09159fcc44ccbd68533df`. |
| OWASP AISVS 1.0 | 191 | CC BY-SA 4.0. Verification rows from `1.0/en/0x10-C*.md`. `OWASP/AISVS` commit `3158f57b7fb8de01eb0c23fee4dd95ec22dd1973`. |
| OWASP SAMM | 90 activities | CC BY-SA 4.0. `longDescription` from `model/activities`. `owaspsamm/core` branch `develop` commit `bc2b5474ab248effbc357c389bec372b0f5e200f`. |
| OWASP Top 10 2021 | 10 | CC BY-SA 4.0. Overview and Description. `OWASP/Top10` commit `3a31f35346c3f4e90f350395124382fa53af2afe`. |
| OWASP Top 10 2025 | 10 | CC BY-SA 4.0. Background and Description from the same Top 10 commit. |
| OWASP API Security Top 10 2023 | 10 | CC BY-SA 4.0. Attack-description row and "Is the API Vulnerable?". `OWASP/API-Security` commit `33cea37b2ffde3e2e62f6b5d79a029a22a846633`. |
| OWASP ML Security Top 10 2023 | 10 | CC BY-SA 4.0. Description section. `OWASP/www-project-machine-learning-security-top-10` commit `eb418d2b5c202d74b58e41f3195f9aaaa93e0563`. |
| HIPAA Security Rule | 69 standards and implementation specifications | US government work, public domain. 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316, transcribed from the Legal Information Institute presentation of the eCFR. ISO values are this repository's control id and short title only. See the HIPAA pull request. |
| NIS2 Article 21(2) technical measures | 199 annex points | EU law, reusable. Annex to Commission Implementing Regulation (EU) 2024/2690. https://eur-lex.europa.eu/eli/reg_impl/2024/2690/oj |
| SOC 2 (2017 TSC) | 61 criteria | Identifier and short original title only. AICPA criterion statements and points of focus are not included. See the SOC 2 pull request. |

## Bring your own

| Framework | Decision |
| --- | --- |
| SOC 1 | There is no universal public control catalog. Control objectives are entity-specific (SSAE 18 / AT-C 320). AICPA text is not redistributed. The import dialog requires the user's workbook. |
| TISAX / VDA ISA | The ISA question catalog is copyrighted and is not redistributed. The import dialog requires the user's workbook. Public scheme labels are metadata only. |
| Secure Controls Framework | CC BY-ND 4.0 does not allow a derivative, including a shortened rewrite or a transformed copy of the control text. No SCF control text is bundled. The import dialog requires the user's workbook. |
| CIS Controls | Remain user-uploaded from the CIS workbook. The pre-existing built-in CIS import path is unchanged. |
| CSA CCM | Remains user-uploaded. |

Bring-your-own workbooks need a control-id column and a title or description column (`.xlsx` or `.csv`). The parser does not invent rows.
