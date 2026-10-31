#!/usr/bin/env bash
# Automatic evidence collection is a Premium feature. The community core must
# not carry collectors, connectors, or the removed security integrations.
# Manual evidence upload and one-off Google Drive import are not collectors.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

content=$(git grep -n -I -E \
  -e 'evidenceCollectors' \
  -e 'evidenceScheduler' \
  -e 'connectors/providers' \
  -e 'compliance-agent' \
  -e '/api/v1/evidence' \
  -e 'api-v1/evidence' \
  -e 'evidenceIngest' \
  -e 'lib/integrations/github(/|$)' \
  -e 'lib/integrations/siem(/|$)' \
  -e 'lib/integrations/soar(/|$)' \
  -e 'lib/integrations/threat-intel(/|$)' \
  -e 'lib/integrations/vulnerability-scanner(/|$)' \
  -e 'executeGitHubAction' \
  -e 'executeSIEMAction' \
  -e 'executeSOARAction' \
  -e 'executeThreatIntelAction' \
  -e 'executeVulnerabilityScannerAction' \
  -e 'get-security-alerts' \
  -e 'list-repos' \
  -- . \
  ':!scripts/check-no-collectors.sh' \
  ':!packages/core/src/data/frameworks/*.catalog.json' \
  || true)

paths=$(git ls-files | grep -E \
  -e '(^|/)lib/integrations/(github|siem|soar|threat-intel|vulnerability-scanner)(/|$)' \
  -e '(^|/)pages/risk/(SIEMDashboard|SOARDashboard|ThreatIntelDashboard|VulnerabilityScanner)\.tsx$' \
  -e '(^|/)pages/api/oauth/github(/|$)' \
  -e '(^|/)connectors/providers(/|$)' \
  -e '(^|/)compliance-agent(/|$)' \
  -e '(^|/)evidenceCollectors(/|$)' \
  -e '(^|/)evidenceScheduler(/|$)' \
  || true)

if [ -n "$content" ] || [ -n "$paths" ]; then
  echo "Automatic evidence collection is a Premium feature and must not be added to the community core."
  if [ -n "$paths" ]; then
    echo "$paths"
  fi
  if [ -n "$content" ]; then
    echo "$content"
  fi
  exit 1
fi
