#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Acquisitions API - Kubernetes Deployment Orchestration Script
#
# Enforces safe ordering & safety gates:
#   1. Resolve Authoritative Image Tag (Explicit argument or active Git HEAD)
#   2. Apply Namespace
#   3. Validate Secrets & Database Target Safety (Rejects production/neondb)
#   4. Render Manifests via Native Ephemeral Kustomize Overlay
#   5. Apply & Execute Database Migration Job
#   6. Wait for Migration Job Completion
#   7. Apply Application Workloads (Deployment, Service, Ingress)
#   8. Wait for Application Rollout Completion
# ==============================================================================

NAMESPACE="acquisitions"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="${ROOT_DIR}/k8s"

KUBECTL="kubectl"
if command -v kubectl.exe >/dev/null 2>&1; then
  if ! kubectl cluster-info >/dev/null 2>&1 && kubectl.exe cluster-info >/dev/null 2>&1; then
    KUBECTL="kubectl.exe"
  fi
fi

# Handle arguments
IMAGE_TAG=""
VALIDATION_DB_URL=""
DRY_RUN=false

for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  elif [ -z "$IMAGE_TAG" ]; then
    IMAGE_TAG="$arg"
  elif [ -z "$VALIDATION_DB_URL" ]; then
    VALIDATION_DB_URL="$arg"
  fi
done

if [ -z "${VALIDATION_DB_URL}" ] && [ -n "${VALIDATION_DATABASE_URL:-}" ]; then
  VALIDATION_DB_URL="${VALIDATION_DATABASE_URL}"
fi

# 1. Authoritative Tag Resolution
if [ -z "${IMAGE_TAG}" ]; then
  if git -C "${ROOT_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
    IMAGE_TAG="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)"
  fi
fi

if [ -z "${IMAGE_TAG}" ]; then
  echo "❌ FATAL: Image tag was not provided and could not be safely derived from Git." >&2
  echo "   Specify an explicit immutable image tag: $0 <IMAGE_TAG> [DATABASE_URL] [--dry-run]" >&2
  exit 1
fi

if [ "${IMAGE_TAG}" = "latest" ]; then
  echo "❌ FATAL SAFETY VIOLATION: Tag 'latest' is forbidden as a deployment source of truth." >&2
  echo "   Deployments require an explicit immutable commit SHA tag." >&2
  exit 1
fi

echo "===================================================================="
echo "🚀 Deploying Acquisitions API to Kubernetes"
echo "   Namespace: ${NAMESPACE}"
echo "   Authoritative Release Tag: ${IMAGE_TAG}"
if [ "$DRY_RUN" = true ]; then
  echo "   Mode: DRY RUN (Client validation only)"
fi
echo "===================================================================="

# Create ephemeral Kustomize overlay to render manifests with authoritative IMAGE_TAG
OVERLAY_DIR=".k8s-overlay-tmp-$$"
mkdir -p "${OVERLAY_DIR}"
cleanup() {
  rm -rf "${OVERLAY_DIR}"
}
trap cleanup EXIT INT TERM

cat <<EOF > "${OVERLAY_DIR}/kustomization.yaml"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8s
images:
  - name: ghcr.io/pradnyan-khandakale/aquisitions
    newTag: "${IMAGE_TAG}"
  - name: ghcr.io/pradnyan-khandakale/aquisitions-migration
    newTag: "${IMAGE_TAG}"
EOF

echo "🔧 Rendering manifests via native Kustomize overlay..."
RENDERED_MANIFESTS=$(${KUBECTL} kustomize "${OVERLAY_DIR}")

if [ "$DRY_RUN" = true ]; then
  echo "🔍 Performing dry-run client validation on rendered manifests..."
  echo "${RENDERED_MANIFESTS}" | ${KUBECTL} apply --dry-run=client -f -
  echo "✅ Dry-run validation succeeded for release ${IMAGE_TAG}."
  exit 0
fi

JOB_MANIFEST=$(echo "${RENDERED_MANIFESTS}" | awk 'BEGIN{RS="---"; ORS="---\n"} /kind: Job/ {print}')
APP_MANIFEST=$(echo "${RENDERED_MANIFESTS}" | awk 'BEGIN{RS="---"; ORS="---\n"} !/kind: Job/ {print}')

# 1. Ensure Namespace exists
echo "📦 [1/5] Applying Namespace..."
${KUBECTL} apply -f "${K8S_DIR}/namespace.yaml"

# 2. Check Secrets & Database Target Safety
echo "🔒 [2/5] Verifying Kubernetes Secrets & Database Safety Gate..."
if ! ${KUBECTL} get secret acquisitions-secrets -n "${NAMESPACE}" >/dev/null 2>&1; then
  if [ -n "${VALIDATION_DB_URL}" ]; then
    echo "Creating 'acquisitions-secrets' from provided validation database URL..."
    # Safely validate target without echoing full URL
    DB_TARGET=$(node -e "try { const u = new URL(process.argv[1]); console.log(u.pathname.replace(/^\//, '')); } catch(e) { console.log(''); }" "${VALIDATION_DB_URL}" 2>/dev/null || node.exe -e "try { const u = new URL(process.argv[1]); console.log(u.pathname.replace(/^\//, '')); } catch(e) { console.log(''); }" "${VALIDATION_DB_URL}" 2>/dev/null || true)
    if [ -z "${DB_TARGET}" ] || [ "${DB_TARGET}" = "neondb" ] || [ "${DB_TARGET}" = "postgres" ] || [[ "${DB_TARGET}" == *"prod"* ]] || [[ "${DB_TARGET}" != *"test"* ]]; then
      echo "❌ FATAL SAFETY VIOLATION: Database target '${DB_TARGET}' is NOT an isolated test database."
      echo "Minikube validation requires an explicit non-production database (e.g. acquisitions_test)."
      exit 1
    fi
    ${KUBECTL} create secret generic acquisitions-secrets -n "${NAMESPACE}" \
      --from-literal="DATABASE_URL=${VALIDATION_DB_URL}" \
      --from-literal="JWT_SECRET=local_minikube_secure_jwt_secret_32bytes" \
      --from-literal="ARCJET_KEY=ajkey_local_mock_token_for_validation" \
      --dry-run=client -o yaml | ${KUBECTL} apply -f -
  else
    echo "⚠️  FATAL: Secret 'acquisitions-secrets' not found in namespace '${NAMESPACE}'."
    echo "   Minikube deployment validation MUST target a dedicated non-production/test database."
    echo "   Provide a safe connection string via VALIDATION_DATABASE_URL or create the secret manually:"
    echo "   ${KUBECTL} apply -f <your-safe-secrets.yaml>"
    exit 1
  fi
fi

# Safe inspection of active Secret target (credentials redacted)
DB_B64=$(${KUBECTL} get secret acquisitions-secrets -n "${NAMESPACE}" -o jsonpath="{.data.DATABASE_URL}")
DB_TARGET=$(node -e "
  try {
    const raw = Buffer.from(process.argv[1], 'base64').toString('utf8');
    const u = new URL(raw);
    console.log(u.pathname.replace(/^\//, ''));
  } catch(e) {
    console.log('invalid');
  }
" "${DB_B64}" 2>/dev/null || node.exe -e "
  try {
    const raw = Buffer.from(process.argv[1], 'base64').toString('utf8');
    const u = new URL(raw);
    console.log(u.pathname.replace(/^\//, ''));
  } catch(e) {
    console.log('invalid');
  }
" "${DB_B64}" 2>/dev/null || true)

echo "Database target:"
echo "${DB_TARGET}"

if [ "${DB_TARGET}" = "neondb" ] || [ "${DB_TARGET}" = "postgres" ] || [[ "${DB_TARGET}" == *"prod"* ]] || [[ "${DB_TARGET}" != *"test"* ]]; then
  echo "❌ FATAL SAFETY VIOLATION: Database target '${DB_TARGET}' is an unsafe production/default database!"
  echo "Minikube validation MUST target a dedicated non-production/test database (e.g. acquisitions_test)."
  echo "Aborting deployment to protect production data."
  exit 1
fi
echo "✅ Database target safety confirmed: '${DB_TARGET}' is an approved non-production database."

# 3. Apply ConfigMap
echo "⚙️  [3/5] Applying ConfigMap..."
${KUBECTL} apply -f "${K8S_DIR}/configmap.yaml"

# 4. Run Migration Job
echo "📜 [4/5] Executing Database Migration Job (Tag: ${IMAGE_TAG})..."
${KUBECTL} delete job acquisitions-migration -n "${NAMESPACE}" --ignore-not-found=true
echo "${JOB_MANIFEST}" | ${KUBECTL} apply -f -

echo "⏳ Waiting for migration Job to finish..."
if ! ${KUBECTL} wait --for=condition=complete job/acquisitions-migration -n "${NAMESPACE}" --timeout=120s; then
  echo "❌ Database migration FAILED. Aborting application rollout."
  ${KUBECTL} describe job acquisitions-migration -n "${NAMESPACE}"
  ${KUBECTL} logs -n "${NAMESPACE}" -l app.kubernetes.io/name=acquisitions-migration --tail=50 || true
  exit 1
fi
echo "✅ Database migration completed successfully."

# 5. Apply Application Workloads (Deployment, Service, Ingress, etc.)
echo "🚀 [5/5] Applying Application Workloads (Tag: ${IMAGE_TAG})..."
echo "${APP_MANIFEST}" | ${KUBECTL} apply -f -

# 6. Verify Rollout
echo "⏳ Waiting for Application Rollout..."
${KUBECTL} rollout status deployment/acquisitions-app -n "${NAMESPACE}" --timeout=120s

echo "===================================================================="
echo "🎉 Deployment successfully rolled out to '${NAMESPACE}'!"
${KUBECTL} get pods,svc,jobs -n "${NAMESPACE}"
echo "===================================================================="
