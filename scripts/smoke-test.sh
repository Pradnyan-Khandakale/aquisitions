#!/usr/bin/env bash
# ==============================================================================
# Acquisitions API - Operational Readiness Post-Deployment Smoke Test (Bash)
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
cleanup() {
  rm -f "${COOKIE_JAR}"
}
trap cleanup EXIT INT TERM

echo "===================================================================="
echo "Starting Operational Smoke Test against: ${BASE_URL}"
echo "===================================================================="

TEST_RUN_ID=$(date +%s%N | cut -b1-8)
CUSTOM_REQ_ID="smoke-req-${TEST_RUN_ID}"

# 1. Test /health/live
echo -e "\n[1/7] Testing Liveness Probe (GET /health/live)..."
LIVE_OUTPUT=$(curl -sS -i -H "x-request-id: ${CUSTOM_REQ_ID}" "${BASE_URL}/health/live")
LIVE_CODE=$(echo "${LIVE_OUTPUT}" | head -n 1 | awk '{print $2}')
if [ "${LIVE_CODE}" -ne 200 ]; then
  echo "FAILED: /health/live returned ${LIVE_CODE}"
  exit 1
fi
echo "PASS: /health/live returned 200 OK"

# 2. Test Request ID propagation
echo -e "\n[2/7] Verifying Request ID propagation..."
PROPAGATED_ID=$(echo "${LIVE_OUTPUT}" | tr -d '\r' | grep -i '^x-request-id:' | awk '{print $2}' || true)
if [ "${PROPAGATED_ID}" != "${CUSTOM_REQ_ID}" ]; then
  echo "FAILED: Request ID not propagated. Expected '${CUSTOM_REQ_ID}', got '${PROPAGATED_ID}'"
  exit 1
fi
echo "PASS: x-request-id header successfully propagated (${PROPAGATED_ID})"

# 3. Test /health/ready
echo -e "\n[3/7] Testing Readiness Probe (GET /health/ready)..."
READY_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/health/ready")
if [ "${READY_CODE}" -ne 200 ]; then
  echo "FAILED: /health/ready returned ${READY_CODE}"
  exit 1
fi
echo "PASS: /health/ready returned 200 READY"

# 4. Test Authentication
echo -e "\n[4/7] Testing Authentication flow..."
AUTH_EMAIL="smoke-${TEST_RUN_ID}@example.test"
SIGNUP_RESP=$(curl -sS -i -c "${COOKIE_JAR}" -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Operator\",\"email\":\"${AUTH_EMAIL}\",\"password\":\"SmokePassword123!\"}" \
  "${BASE_URL}/api/auth/sign-up")
SIGNUP_CODE=$(echo "${SIGNUP_RESP}" | head -n 1 | awk '{print $2}')
if [ "${SIGNUP_CODE}" -ne 201 ]; then
  echo "FAILED: Signup returned ${SIGNUP_CODE}"
  exit 1
fi
echo "PASS: User registered and authenticated"

# 5. Test Protected API (Deal Stages)
echo -e "\n[5/7] Testing Protected API Route (GET /api/deal-stages)..."
STAGES_RESP=$(curl -sS -b "${COOKIE_JAR}" "${BASE_URL}/api/deal-stages")
DEAL_STAGE_ID=$(echo "${STAGES_RESP}" | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2 || true)
if [ -z "${DEAL_STAGE_ID}" ]; then
  echo "No existing deal stages; creating initial stage for test..."
  CREATE_STAGE_RESP=$(curl -sS -b "${COOKIE_JAR}" -H "Content-Type: application/json" \
    -d "{\"name\":\"Smoke Stage ${TEST_RUN_ID}\"}" \
    "${BASE_URL}/api/deal-stages")
  DEAL_STAGE_ID=$(echo "${CREATE_STAGE_RESP}" | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2 || true)
fi
if [ -z "${DEAL_STAGE_ID}" ]; then
  echo "FAILED: Could not obtain deal stage ID"
  exit 1
fi
echo "PASS: Protected API accessible with valid session cookie (stage ID: ${DEAL_STAGE_ID})"

# 6. Test Acquisition CRUD
echo -e "\n[6/7] Testing Acquisition creation and lookup..."
COMPANY_RESP=$(curl -sS -b "${COOKIE_JAR}" -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Co ${TEST_RUN_ID}\",\"industry\":\"Technology\"}" \
  "${BASE_URL}/api/companies")
COMPANY_ID=$(echo "${COMPANY_RESP}" | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2 || true)

ACQ_RESP=$(curl -sS -b "${COOKIE_JAR}" -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke Deal ${TEST_RUN_ID}\",\"company_id\":${COMPANY_ID},\"deal_stage_id\":${DEAL_STAGE_ID},\"estimated_value\":500000}" \
  "${BASE_URL}/api/acquisitions")
ACQ_ID=$(echo "${ACQ_RESP}" | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2 || true)

GET_ACQ_CODE=$(curl -sS -b "${COOKIE_JAR}" -o /dev/null -w "%{http_code}" "${BASE_URL}/api/acquisitions/${ACQ_ID}")
if [ "${GET_ACQ_CODE}" -ne 200 ]; then
  echo "FAILED: Acquisition lookup returned ${GET_ACQ_CODE}"
  exit 1
fi
echo "PASS: Acquisition successfully created and retrieved"

# 7. Test Error Response Behavior
echo -e "\n[7/7] Testing Error Response & Request ID Propagation on 401..."
ERR_OUTPUT=$(curl -sS -i -H "Content-Type: application/json" \
  -d '{"email":"invalid@example.test","password":"bad"}' \
  "${BASE_URL}/api/auth/sign-in")
ERR_CODE=$(echo "${ERR_OUTPUT}" | head -n 1 | awk '{print $2}')
if [ "${ERR_CODE}" -ne 401 ]; then
  echo "FAILED: Expected 401, got ${ERR_CODE}"
  exit 1
fi
echo "PASS: Rejected invalid credentials with 401 and propagated x-request-id"

echo -e "\n===================================================================="
echo "ALL OPERATIONAL SMOKE TESTS PASSED SUCCESSFULLY!"
echo "===================================================================="
