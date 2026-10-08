# Operational Runbook & Production Go-Live Guide

## 1. Architecture Overview & Observability Model

The Acquisitions API runs as an immutable, containerized workload on Kubernetes (Namespace: `acquisitions`). Operational readiness is built upon six core principles:

1. **Immutable Releases:** Every deployment strictly binds to an authoritative Git commit SHA for both application and database migration container images (`ghcr.io/pradnyan-khandakale/aquisitions:<SHA>` and `ghcr.io/pradnyan-khandakale/aquisitions-migration:<SHA>`). Tag `latest` is strictly rejected.
2. **Pre-Rollout Migration Sequencing:** Database migrations run as a Kubernetes Job before the application Deployment rolls out. A migration failure halts the pipeline immediately and prevents application rollout.
3. **Structured JSON Logging:** In production (`NODE_ENV=production`), all application and HTTP access logs are emitted to `stdout`/`stderr` as single-line JSON objects with timestamps, log level, service identity, environment, release SHA, and request correlation IDs.
4. **End-to-End Request Correlation:** Inbound HTTP requests receive or generate an RFC 4122 UUID v4 request ID (`x-request-id`), which propagates to response headers, AsyncLocalStorage, downstream log records, and error responses.
5. **Zero-Leak Secret Redaction:** All log paths automatically scrub connection strings, passwords, JWT tokens, Arcjet keys, Authorization headers, and session cookies.
6. **Decoupled Health Semantics:** Liveness (`/health/live`) validates Node.js event-loop responsiveness without infrastructure dependencies; Readiness (`/health/ready`) verifies live database connectivity.

---

## 2. Deployment Runbook

### Deploying an Immutable Release

Deployments are executed via the orchestration scripts:

- **PowerShell (Windows):**
  ```powershell
  .\scripts\deploy-k8s.ps1 -ImageTag "<GIT_COMMIT_SHA>" [-DatabaseUrl "<TEST_DB_URL>"]
  ```
- **Bash (Linux/macOS/CI):**
  ```bash
  ./scripts/deploy-k8s.sh --image-tag "<GIT_COMMIT_SHA>" [--database-url "<TEST_DB_URL>"]
  ```

### Deployment Workflow & Execution Order

1. **Authoritative Tag Resolution:** Resolves `-ImageTag` or derives the active Git HEAD SHA (`git rev-parse HEAD`). Fails closed if unspecified or if set to `latest`.
2. **Namespace & Secret Verification:** Ensures namespace `acquisitions` and secret `acquisitions-secrets` exist. Validates that `DATABASE_URL` targets an approved database (rejects `neondb`, `postgres`, or unapproved production targets during test/validation runs).
3. **Ephemeral Kustomize Overlay:** Creates a transient overlay pointing to [k8s/](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/) with `newTag: <GIT_COMMIT_SHA>` for both images.
4. **Database Migration Execution:** Applies [k8s/migration-job.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/migration-job.yaml) and blocks waiting for Job completion (`kubectl wait --for=condition=complete job/acquisitions-migration -n acquisitions --timeout=120s`).
5. **Workload Rollout:** Applies [k8s/deployment.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/deployment.yaml), [k8s/service.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/service.yaml), [k8s/ingress.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/ingress.yaml), and [k8s/pdb.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/pdb.yaml).
6. **Rollout Verification:** Monitors deployment progress (`kubectl rollout status deployment/acquisitions-app -n acquisitions --timeout=120s`).

### Verifying Deployed Images

```bash
# Verify actual container images running in the Pods
kubectl get pods -n acquisitions -l app.kubernetes.io/name=acquisitions-api \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

# Verify migration Job image
kubectl get job acquisitions-migration -n acquisitions \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

---

## 3. Health & Probes Reference

### Liveness Probe (`GET /health/live`)

- **Purpose:** Answers: _Is the Node.js application process running and capable of handling I/O?_
- **Kubernetes Configuration:**
  - `initialDelaySeconds: 5`
  - `periodSeconds: 10`
  - `timeoutSeconds: 3`
  - `failureThreshold: 3`
- **Response Format (200 OK):**
  ```json
  {
    "status": "OK",
    "uptime": 142.5,
    "timestamp": "2026-10-08T18:00:00.000Z"
  }
  ```
- **Operational Rule:** **Never** add database or external service checks to `/health/live`. If the database is down, restarting the application pod will not restore database connectivity and triggers catastrophic cascading crash loops.

### Readiness Probe (`GET /health/ready`)

- **Purpose:** Answers: _Can this instance safely process user traffic?_
- **Kubernetes Configuration:**
  - `initialDelaySeconds: 10`
  - `periodSeconds: 5`
  - `timeoutSeconds: 3`
  - `failureThreshold: 3`
- **Behavior:** Executes `SELECT 1` via [src/config/database.js](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/src/config/database.js).
  - Returns `200 OK` (`status: "READY"`, `database: "connected"`) when reachable.
  - Returns `503 Service Unavailable` (`status: "NOT_READY"`, `database: "disconnected"`) when connectivity fails.
- **What to check when readiness fails:**
  1. Inspect pod events: `kubectl describe pod -n acquisitions -l app.kubernetes.io/name=acquisitions-api`
  2. Inspect readiness logs: `kubectl logs -n acquisitions -l app.kubernetes.io/name=acquisitions-api | grep "Readiness probe"`
  3. Validate Neon/PostgreSQL network path and credentials in secret `acquisitions-secrets`.

---

## 4. Structured Logging & Request Correlation

### Log Output & Collection

In production containers, logs are written exclusively to `stdout`/`stderr`. No local file transports are used inside containers, ensuring compatibility with container log collectors (FluentBit, Datadog, CloudWatch, Loki).

### Production JSON Schema

```json
{
  "level": "info",
  "message": "HTTP GET /api/acquisitions 200",
  "method": "GET",
  "path": "/api/acquisitions",
  "status": 200,
  "durationMs": 42.15,
  "requestId": "e1f2a3b4-5678-90ab-cdef-1234567890ab",
  "ip": "10.244.0.1",
  "userAgent": "Mozilla/5.0 ...",
  "service": "acquisitions-api",
  "environment": "production",
  "version": "a1b2c3d4e5f6...",
  "timestamp": "2026-10-08T18:05:12.345Z"
}
```

### Filtering Logs by Request ID

```bash
# Using kubectl and jq
kubectl logs -n acquisitions -l app.kubernetes.io/name=acquisitions-api --tail=500 | \
  jq 'select(.requestId == "e1f2a3b4-5678-90ab-cdef-1234567890ab")'

# Searching for all error level events
kubectl logs -n acquisitions -l app.kubernetes.io/name=acquisitions-api --tail=500 | \
  jq 'select(.level == "error")'
```

### Log Redaction Rules

Implemented in [src/utils/redact.js](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/src/utils/redact.js) and [src/config/logger.js](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/src/config/logger.js):

- **Database URLs:** User password credentials replaced with `[REDACTED]`.
- **JWT Tokens:** Formatted as `[REDACTED_JWT]`.
- **Arcjet Keys:** Formatted as `[REDACTED_ARCJET_KEY]`.
- **Authorization & Cookie Headers:** Formatted as `Bearer [REDACTED]` and `token=[REDACTED]`.
- **Sensitive Object Properties:** Properties matching `password`, `token`, `secret`, `jwt_secret`, `database_url`, `cookie`, `apiKey` are recursively replaced with `[REDACTED]`.
- **Error Objects:** `message` and `stack` properties are parsed and scrubbed of any embedded secret patterns.

---

## 5. Rollback Procedure

When an incident requires rolling back the application, **always roll back to a previously validated immutable Git commit SHA**.

> [!CAUTION]
> Do NOT use `kubectl rollout undo deployment/acquisitions-app`. A native `kubectl rollout undo` does NOT account for database migrations, does not update tracked deployment state, and can cause version mismatch between the application and database schema.

### Safe Rollback Procedure

1. **Identify the Last Known Good Release SHA:**
   Check GitHub releases or previous successful CI workflow runs on `main` to identify the target commit SHA (e.g., `prev_sha_1234567`).
2. **Execute Deployment with Target SHA:**
   ```powershell
   .\scripts\deploy-k8s.ps1 -ImageTag "prev_sha_1234567"
   ```
   Or in Linux/Bash:
   ```bash
   ./scripts/deploy-k8s.sh --image-tag "prev_sha_1234567"
   ```
3. **Verify Rollout:**
   ```bash
   kubectl rollout status deployment/acquisitions-app -n acquisitions
   kubectl get pods -n acquisitions -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
   ```
4. **Execute Post-Deployment Smoke Test:**
   ```powershell
   .\scripts\smoke-test.ps1 -BaseUrl "https://api.example.com"
   ```

---

## 6. Incident Failure Scenarios & Operator Runbooks

### 1. Failed Database Migration

- **Symptom:** Deployment halts at step `[4/5] Executing Database Migration Job`. `kubectl wait` exits non-zero.
- **Cause:** Schema conflict, bad SQL syntax, locked table, or database unreachable.
- **Operator Actions:**
  1. Inspect migration logs:
     ```bash
     kubectl logs -n acquisitions -l app.kubernetes.io/name=acquisitions-migration --tail=100
     ```
  2. Inspect Job status and failure reasons:
     ```bash
     kubectl describe job acquisitions-migration -n acquisitions
     ```
  3. Verify application pods were **NOT** touched. Existing application replicas remain on the previous release.
  4. Fix migration script in the codebase, re-test against a test branch, and re-deploy a new commit SHA.

### 2. Failed Application Rollout (Rollout Timeout)

- **Symptom:** `kubectl rollout status` times out after 120s. Old pods remain running because `maxUnavailable: 0`.
- **Cause:** New pods failing liveness or readiness probes, crash loop on startup, or resource limits exceeded.
- **Operator Actions:**
  1. Inspect pod status:
     ```bash
     kubectl get pods -n acquisitions
     ```
  2. Describe failing new pods:
     ```bash
     kubectl describe pod <new-pod-name> -n acquisitions
     ```
  3. Inspect container logs:
     ```bash
     kubectl logs <new-pod-name> -n acquisitions app
     ```
  4. Abort rollout and revert to previous SHA using the safe rollback procedure.

### 3. Readiness Probe Failure

- **Symptom:** Pod status is `Running`, but `READY` shows `0/1`. Service routes traffic only to remaining ready pods.
- **Cause:** Database connection pool exhausted, network partition to Neon Postgres, or invalid database credentials.
- **Operator Actions:**
  1. Check readiness probe output in pod events:
     ```bash
     kubectl describe pod <pod-name> -n acquisitions
     ```
  2. Query `/health/ready` manually via port-forward:
     ```bash
     kubectl port-forward <pod-name> -n acquisitions 3000:3000
     curl -i http://localhost:3000/health/ready
     ```
  3. Verify Neon branch status at `console.neon.tech`.

### 4. CrashLoopBackOff

- **Symptom:** Pod restarts repeatedly; status shows `CrashLoopBackOff`.
- **Cause:** Fatal startup error (e.g. missing `ARCJET_KEY` or `DATABASE_URL` secret, uncaught fatal exception).
- **Operator Actions:**
  1. Inspect previous container logs:
     ```bash
     kubectl logs <pod-name> -n acquisitions app --previous
     ```
  2. Verify secret presence:
     ```bash
     kubectl get secret acquisitions-secrets -n acquisitions
     ```
  3. Confirm required keys exist in secret (`DATABASE_URL`, `JWT_SECRET`, `ARCJET_KEY`).

### 5. Database Unavailable (Postgres / Neon Outage)

- **Symptom:** Readiness probes fail across all replicas. `/health/ready` returns 503. `/health/live` remains 200 OK.
- **Behavior:** Existing pods do NOT crash loop; they stay running, allowing Kubernetes to maintain service endpoints while buffering or returning 503s.
- **Operator Actions:**
  1. Check Neon project operational status.
  2. If Neon compute scale-to-zero is active, the first incoming query may experience cold-start latency; readiness probe retries (3 retries, 5s period) tolerate transient wakeups.

### 6. Image Pull Failure (`ErrImagePull` / `ImagePullBackOff`)

- **Symptom:** Pod cannot start; status shows `ErrImagePull` or `ImagePullBackOff`.
- **Cause:** Image tag not yet pushed to GHCR, image tag mismatch, or private registry credentials missing.
- **Operator Actions:**
  1. Inspect image reference:
     ```bash
     kubectl describe pod <pod-name> -n acquisitions | grep Image:
     ```
  2. Verify that GitHub Actions `docker-release` job finished publishing `ghcr.io/pradnyan-khandakale/aquisitions:<SHA>` to GHCR.
  3. If GHCR package is private, ensure `ghcr-pull-secret` is created and configured in [k8s/deployment.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/deployment.yaml).

---

## 7. Security & Secret Rotation Procedures

All production credentials must be rotated on a scheduled interval or immediately following an incident. **Never commit credentials to version control.**

### Credential Matrix

| Secret Name            | Key Name            | Managed In      | Target System     | Rotation Frequency     |
| :--------------------- | :------------------ | :-------------- | :---------------- | :--------------------- |
| `acquisitions-secrets` | `DATABASE_URL`      | Neon Console    | Kubernetes Secret | 90 days / On incident  |
| `acquisitions-secrets` | `JWT_SECRET`        | Secret Manager  | Kubernetes Secret | 180 days / On incident |
| `acquisitions-secrets` | `ARCJET_KEY`        | Arcjet Console  | Kubernetes Secret | 180 days / On incident |
| `ghcr-pull-secret`     | `.dockerconfigjson` | GitHub Settings | Kubernetes Secret | Annual                 |

### Secret Rotation Command

To rotate secrets without service disruption:

```bash
# Update secret in Kubernetes
kubectl create secret generic acquisitions-secrets -n acquisitions \
  --from-literal="DATABASE_URL=<NEW_URL>" \
  --from-literal="JWT_SECRET=<NEW_JWT_SECRET>" \
  --from-literal="ARCJET_KEY=<NEW_ARCJET_KEY>" \
  --dry-run=client -o yaml | kubectl apply -f -

# Trigger graceful rolling restart of application pods
kubectl rollout restart deployment/acquisitions-app -n acquisitions
kubectl rollout status deployment/acquisitions-app -n acquisitions
```

---

## 8. Production Go-Live Checklist

Before declaring production readiness or releasing traffic to users, verify every item below:

- [ ] **Repository Clean:** `git status --short` confirms no unintended modifications or staged artifacts.
- [ ] **CI Pipeline Green:** GitHub Actions workflow `quality` and `docker-release` jobs pass on `main`.
- [ ] **Automated Test Suite Passing:** All 12 test suites and 121+ tests pass with zero failures (`npm test`).
- [ ] **Coverage Thresholds Met:** Jest coverage meets global thresholds (branches, functions, lines, statements) without regression.
- [ ] **ESLint Passing:** Clean lint run without warnings or errors (`npm run lint`).
- [ ] **Prettier Formatting Passing:** Codebase conforms strictly to Prettier formatting rules (`npm run format:check`).
- [ ] **npm Audit High/Critical Passing:** Zero high or critical severity package vulnerabilities (`npm run audit:check`).
- [ ] **Trivy Container Scan Passing:** Production application and migration container images pass high/critical vulnerability and secret scans.
- [ ] **Application Image Published:** Immutable commit SHA image available on GHCR (`ghcr.io/pradnyan-khandakale/aquisitions:<SHA>`).
- [ ] **Migration Image Published:** Immutable commit SHA migration runner available on GHCR (`ghcr.io/pradnyan-khandakale/aquisitions-migration:<SHA>`).
- [ ] **Authoritative SHA Identified:** Release tag strictly points to the validated immutable Git commit SHA.
- [ ] **Database Target Verified:** Database target URL verified with SSL mode enabled (`sslmode=require`).
- [ ] **Database Migrations Successful:** Migration Job completes cleanly before application rollout.
- [ ] **2 Replicas Healthy:** Kubernetes deployment maintains 2 healthy, ready pods.
- [ ] **PodDisruptionBudget Configured:** `minAvailable: 1` active on `acquisitions-app-pdb`.
- [ ] **Liveness Probes Healthy:** `/health/live` returns 200 OK without depending on external infrastructure.
- [ ] **Readiness Probes Healthy:** `/health/ready` returns 200 READY with database connected.
- [ ] **Structured Logs Observable:** Production logs emit structured JSON to stdout/stderr with timestamp, level, service, environment, and release version.
- [ ] **Request Correlation Observable:** `x-request-id` header generated on all requests and present in logs and responses.
- [ ] **Zero Secrets Exposed:** Logs verified clean of connection strings, passwords, JWT tokens, and Arcjet keys.
- [ ] **Rollback Procedure Documented:** Tested immutable SHA rollback command documented in [OPERATIONS.md](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/OPERATIONS.md).
