#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Acquisitions API - Kubernetes Deployment Orchestration Script
#
# Enforces safe ordering & safety gates:
#   1. Apply Namespace
#   2. Validate Secrets & Database Target Safety (Rejects production/neondb)
#   3. Apply ConfigMap
#   4. Apply & Execute Database Migration Job
#   5. Wait for Migration Job Completion
#   6. Apply/Update Application Deployment & Service
#   7. Wait for Application Rollout Completion
# ==============================================================================

NAMESPACE="acquisitions"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
K8S_DIR="${ROOT_DIR}/k8s"

IMAGE_TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo "7f23d58")}"
VALIDATION_DB_URL="${VALIDATION_DATABASE_URL:-${2:-}}"

echo "===================================================================="
echo "🚀 Deploying Acquisitions API to Kubernetes"
echo "   Namespace: ${NAMESPACE}"
echo "   Target Image Tag: ${IMAGE_TAG}"
echo "===================================================================="

# 1. Ensure Namespace exists
echo "📦 [1/5] Applying Namespace..."
kubectl apply -f "${K8S_DIR}/namespace.yaml"

# 2. Check Secrets & Database Target Safety
echo "🔒 [2/5] Verifying Kubernetes Secrets & Database Safety Gate..."
if ! kubectl get secret acquisitions-secrets -n "${NAMESPACE}" >/dev/null 2>&1; then
  if [ -n "${VALIDATION_DB_URL}" ]; then
    echo "Creating 'acquisitions-secrets' from provided validation database URL..."
    # Safely validate target without echoing full URL
    DB_TARGET=$(node -e "try { const u = new URL(process.argv[1]); console.log(u.pathname.replace(/^\//, '')); } catch(e) { console.log(''); }" "${VALIDATION_DB_URL}")
    if [ -z "${DB_TARGET}" ] || [ "${DB_TARGET}" = "neondb" ] || [ "${DB_TARGET}" = "postgres" ] || [[ "${DB_TARGET}" == *"prod"* ]] || [[ "${DB_TARGET}" != *"test"* ]]; then
      echo "❌ FATAL SAFETY VIOLATION: Database target '${DB_TARGET}' is NOT an isolated test database."
      echo "Minikube validation requires an explicit non-production database (e.g. acquisitions_test)."
      exit 1
    fi
    kubectl create secret generic acquisitions-secrets -n "${NAMESPACE}" \
      --from-literal="DATABASE_URL=${VALIDATION_DB_URL}" \
      --from-literal="JWT_SECRET=local_minikube_secure_jwt_secret_32bytes" \
      --from-literal="ARCJET_KEY=ajkey_local_mock_token_for_validation" \
      --dry-run=client -o yaml | kubectl apply -f -
  else
    echo "⚠️  FATAL: Secret 'acquisitions-secrets' not found in namespace '${NAMESPACE}'."
    echo "   Minikube deployment validation MUST target a dedicated non-production/test database."
    echo "   Provide a safe connection string via VALIDATION_DATABASE_URL or create the secret manually:"
    echo "   kubectl apply -f <your-safe-secrets.yaml>"
    exit 1
  fi
fi

# Safe inspection of active Secret target (credentials redacted)
DB_B64=$(kubectl get secret acquisitions-secrets -n "${NAMESPACE}" -o jsonpath="{.data.DATABASE_URL}")
DB_TARGET=$(node -e "
  try {
    const raw = Buffer.from(process.argv[1], 'base64').toString('utf8');
    const u = new URL(raw);
    console.log(u.pathname.replace(/^\//, ''));
  } catch(e) {
    console.log('invalid');
  }
" "${DB_B64}")

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
kubectl apply -f "${K8S_DIR}/configmap.yaml"

# 4. Run Migration Job
echo "📜 [4/5] Executing Database Migration Job..."
kubectl delete job acquisitions-migration -n "${NAMESPACE}" --ignore-not-found=true
kubectl apply -f "${K8S_DIR}/migration-job.yaml"

echo "⏳ Waiting for migration Job to finish..."
if ! kubectl wait --for=condition=complete job/acquisitions-migration -n "${NAMESPACE}" --timeout=120s; then
  echo "❌ Database migration FAILED. Aborting application rollout."
  kubectl describe job acquisitions-migration -n "${NAMESPACE}"
  kubectl logs -n "${NAMESPACE}" -l app.kubernetes.io/name=acquisitions-migration --tail=50 || true
  exit 1
fi
echo "✅ Database migration completed successfully."

# 5. Apply Deployment & Service
echo "🚀 [5/5] Applying Application Deployment, Service, and Ingress..."
kubectl apply -f "${K8S_DIR}/service.yaml"
kubectl apply -f "${K8S_DIR}/ingress.yaml"
kubectl apply -f "${K8S_DIR}/deployment.yaml"

# 6. Verify Rollout
echo "⏳ Waiting for Application Rollout..."
kubectl rollout status deployment/acquisitions-app -n "${NAMESPACE}" --timeout=120s

echo "===================================================================="
echo "🎉 Deployment successfully rolled out to '${NAMESPACE}'!"
kubectl get pods,svc,jobs -n "${NAMESPACE}"
echo "===================================================================="
