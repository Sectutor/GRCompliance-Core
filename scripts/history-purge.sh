#!/usr/bin/env bash
# Rewrite ALL history of a local mirror so category C/D paths and secrets are gone.
#
# This script does not push. Do not point it at GitHub until the owner has
# approved a force-push. Run it on a fresh mirror clone:
#
#   git clone --mirror git@github.com:Sectutor/GRCompliance-Core.git /tmp/grc-mirror.git
#   cd /tmp/grc-mirror.git
#   PURGE_REPLACEMENTS=/secure/path/history-purge-replacements.txt \
#     /path/to/scripts/history-purge.sh
#
# PURGE_REPLACEMENTS is optional but required for a complete purge. It is a
# git-filter-repo replacements file (literal==>REDACTED) and is NOT committed
# here, because it contains the leaked secret strings. The owner copy lives
# with the private archive, not in this public branch.
#
# After it finishes, verify before any push:
#   gitleaks detect --source . --log-opts='--all' --redact --no-banner
#   git log --all --name-only --pretty=format: | sort -u | grep -E 'sendgrid.env|p1.json|uploads/|tmp_build/|sales-forecast.md' && exit 1
#
# Side effects, which the owner must accept before pushing:
#   - Every commit SHA changes. Tags are rewritten.
#   - Open pull requests and the public fork keep the old history.
#   - GitHub Support must purge cached views and unreferenced objects.
#   - Every contributor must delete their clone and clone again.
set -euo pipefail

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo is required" >&2
  exit 1
fi

if ! git rev-parse --is-bare-repository >/dev/null 2>&1; then
  echo "Run this inside a mirror (bare) clone, not a working tree." >&2
  exit 1
fi

args=(
  --force
  --invert-paths
  --path sendgrid.env
  --path p1.json
  --path p2.json
  --path .env.scalability
  --path netlify-update.json
  --path trpc_resp.json
  --path sales-forecast.md
  --path GRC-ANNIHILATION.md
  --path GRC-DISRUPTION-STRATEGY.md
  --path GRC-EXTINCTION-EVENT.md
  --path HOW-TO-FIND-MSPS.md
  --path INFRASTRUCTURE-PIVOT.md
  --path THE-PIVOT-MARKETING-NOT-PRODUCT.md
  --path SAAS-FUTURE-INSIGHTS.md
  --path SAAS-FUTURE-SIMPLE.md
  --path TECHNICAL-INFRASTRUCTURE.md
  --path ENTERPRISE_SCALABILITY_COMPLETE.md
  --path THREAT_INTEL_REVIEW.md
  --path implementation_summary.md
  --path premium-backup-restore.md
  --path seed-risk-data.sql
  --path server-enterprise.ts
  --path risk-report-test-2026-01-04.docx
  --path index.css.backup
  --path uploads
  --path recommendations
  --path packages/core/tmp_build
  --path packages/core/scripts
  --path .vercel
  --path tmp_empty
  --path docs/ENTERPRISE_SCALABILITY.md
  --path docs/STRATEGIC_DIFFERENTIATORS.md
  --path docs/FEATURE_GRADUATION.md
  --path docs/DEVELOPMENT_MANUAL.md
  --path docs/license-management.md
  --path docs/DEPLOYMENT_NETLIFY.md
  --path docs/DEPLOYMENT_MULTI_DOMAIN.md
  --path docs/DEPLOYMENT_AUTOMATION.md
  --path docs/PASTA_IMPLEMENTATION.md
  --path docs/roadmaps
  --path scripts/find_duplicates.ts
  --path scripts/update-netlify-build.mjs
  --path packages/core/.env.development
  --path packages/core/src/scripts/diag_iso_empty.ts
  --path packages/core/src/scripts/seed-assets-client-3.ts
  --path packages/core/src/scripts/simulate_router.ts
)

# Root scratch scripts and one-off tests that carried the database password
# or operator notes. Directories above already cover uploads and build output.
while IFS= read -r path; do
  [ -z "$path" ] && continue
  args+=(--path "$path")
done << 'EOF'
add_column.ts
add_fips_rationale.ts
add_fisma_system_id.ts
add_question_id_column.ts
add_questionnaire_columns.ts
add_questionnaire_vendor_columns.ts
add_samm_column.cjs
alter_risk_scenarios.ts
alter_schema.ts
audit_visibility.ts
bulkAssign.test.ts
bulkPolicies.test.ts
calendar.test.ts
check-clients.ts
check-db.ts
check-dsar-table.ts
check-risk-178.ts
check-training-table.ts
checkBothTables.cjs
checkRoadmap2.cjs
checkRoadmap5Data.cjs
checkRoadmapData.cjs
complianceReport.test.ts
contactInfo.test.ts
controlNotes.test.ts
controlPolicyIntegration.test.ts
controls.test.ts
count_evidence.ts
createTestData.js
createTestDataClean.cjs
createTestDataDirect.cjs
createTestDataFinal.cjs
createTestDataSimple.cjs
createTestDataSimpleDirect.cjs
dashboard.test.ts
delete-duplicates.ts
direct_check_db.js
dump-risks.ts
emailNotification.ts
evidenceFiles.test.ts
find_asvs_files_v2.ts
fix-dashboard-colors.cjs
fix-dashboard-colors.js
index.ts
inspect_risk_table.ts
logoUpload.test.ts
manual-migration.ts
migrate-report-logs.ts
migrate_e8.ts
migrate_maturity.ts
migrate_threat_asset_mappings.ts
nuke_and_seed.ts
onboarding.test.ts
patch_assets_page.cjs
policyExport.ts
policyExport.test.ts
policyExportProfessional.test.ts
policyZipExport.test.ts
policyZipExport.ts
populateRoadmap5.cjs
promote_admin.ts
raci.test.ts
read_report.ts
recover_data.ts
revert-dashboard-light.cjs
revert-dashboard-light2.cjs
revert-dashboard-light3.cjs
rewrite-dashboard.cjs
rewrite-risk-hub-actual.cjs
rewrite-risk-hub.cjs
run_seed.cjs
run_seed.ts
schema_snippet.ts
search.test.ts
seed-risk-data.sql
seedComplianceSimulation.ts
seedPrivacyData.ts
seed_data.ts
seed_data_inventory.ts
seed_email_templates.ts
seed_fips199.ts
seed_gdpr_plan.ts
seed_gdpr_tasks.ts
seed_learning_content.ts
seed_nist_complete.cjs
seed_nist_csf.ts
seed_nist_fixed.cjs
seed_remaining.cjs
seed_tasks.ts
seed_v2.ts
setup_fips199.ts
setup_nist_table.cjs
targetScore.test.ts
temp_wizard_old.tsx
temp_wizard_old_v3.tsx
temp_wizard_safe.tsx
test-audit-bundle.ts
test-direct-update.ts
test-env.ts
test-schema-simple.ts
test-schema.ts
test-supabase.ts
test-trpc-training.ts
test-update.ts
testRoadmapsAPI.cjs
testTRPCAPI.cjs
test_ai.ts
test_api_error.js
test_baseline.ts
test_client_controls.js
test_conn.js
test_create_policy.ts
test_db.js
test_db.ts
test_deepseek.ts
test_dpa_create.ts
test_email_dispatch.ts
test_email_preview.html
test_fetch.js
test_import.ts
test_import_integrations.ts
test_mutation.ts
test_pg.ts
test_report.ts
test_schema.ts
test_schema_load.ts
test_soa.ts
test_supabase_conn.ts
test_trpc.ts
test_vulnerability_scanner.ts
verifyRoadmap5.cjs
verify_ai_suggestions.ts
verify_all.ts
verify_all_cols.ts
verify_columns.ts
verify_counts.ts
verify_custom_control.ts
verify_db.ts
verify_db_members.ts
verify_email_system.ts
verify_framework_fix.ts
verify_mitigation_linking.ts
verify_notification.ts
verify_notification_placeholder.ts
verify_pdf_parse.ts
verify_policy_integration.ts
EOF

if [ -n "${PURGE_REPLACEMENTS:-}" ]; then
  if [ ! -f "$PURGE_REPLACEMENTS" ]; then
    echo "PURGE_REPLACEMENTS does not exist: $PURGE_REPLACEMENTS" >&2
    exit 1
  fi
  args+=(--replace-text "$PURGE_REPLACEMENTS")
else
  echo "warning: PURGE_REPLACEMENTS is unset. Path removal will run. Strings inside kept files will remain until you pass a replacements file." >&2
fi

git filter-repo "${args[@]}"
echo "filter-repo finished. This mirror was not pushed."
