# Kubernetes Deployment Guide (Phase 4.1 Baseline)

This guide documents the Kubernetes deployment architecture, orchestration workflow, security baseline, and local Minikube validation for the Acquisitions API (`aquisitions`).

---

## 1. Architecture Overview

```text
                                [ Internet / Client ]
                                          │
                                   [ Ingress (80) ]
                                          │
                               [ Service (ClusterIP:80) ]
                                          │
                      ┌───────────────────┴───────────────────┐
                      ▼                                       ▼
          [ Pod 1 (Node.js 22 LTS) ]             [ Pod 2 (Node.js 22 LTS) ]
          Port 3000 / Non-root 1001              Port 3000 / Non-root 1001
          Read-only Root Filesystem              Read-only Root Filesystem
                      │                                       │
                      └───────────────────┬───────────────────┘
                                          ▼
                               [ Neon PostgreSQL ]
```

### Resource Organization (`k8s/`)

- `k8s/namespace.yaml`: Dedicated namespace `acquisitions` (no application workloads in `default`).
- `k8s/configmap.yaml`: Non-sensitive runtime variables (`NODE_ENV=production`, `PORT=3000`, `LOG_LEVEL=info`, `CORS_ORIGIN`).
- `k8s/secret.example.yaml`: Template for sensitive secrets (`DATABASE_URL`, `JWT_SECRET`, `ARCJET_KEY`).
- `k8s/registry-secret.example.yaml`: Template for GHCR container pull secret (`ghcr-pull-secret`).
- `k8s/migration-job.yaml`: Pre-deployment database migration Job running the dedicated `migration` container stage.
- `k8s/deployment.yaml`: Application Deployment with 2 replicas, rolling update strategy, hardened security contexts, and health probes.
- `k8s/service.yaml`: Internal `ClusterIP` Service exposing port 80 -> containerPort 3000.
- `k8s/ingress.yaml`: Ingress resource template routing `api.example.com` to `acquisitions-service:80`.
- `k8s/kustomization.yaml`: Declarative manifest overlay supporting image tag updates.

---

## 2. Immutable Image Convention

Deployments strictly consume immutable commit SHA images produced and scanned in Phase 3.3 CI/CD. The release pipeline publishes both exact images from the same release commit:

1. **Application Runtime Image:**

   ```text
   ghcr.io/pradnyan-khandakale/aquisitions:<commit-sha>
   ```

   - Minimal Node.js 22 LTS runtime.
   - Strips all development, build, and migration tooling (`drizzle-kit`, `tsx`, `esbuild`) to maintain zero runtime vulnerabilities.
   - Runs as non-root user `nodejs` (UID 1001) with read-only root filesystem.

2. **Database Migration Image:**

   ```text
   ghcr.io/pradnyan-khandakale/aquisitions-migration:<commit-sha>
   ```

   - Dedicated migration runner container (`target: migration`).
   - Contains `drizzle-kit` and migration files under `/app/drizzle` solely for executing `npm run db:migrate`.
   - Does NOT expose port 3000 or handle application traffic.
   - Runs as non-root user `nodejs` (UID 1001) with read-only root filesystem.

> [!IMPORTANT]
> Both the application runtime image and the migration image MUST correspond to the exact same release commit SHA. The rolling `:latest` tag is never used as the deployment source of truth.

---

## 3. Configuration & Secrets

### Non-Sensitive (`ConfigMap`)

Applied from `k8s/configmap.yaml`:

- `NODE_ENV`: `production`
- `PORT`: `3000`
- `LOG_LEVEL`: `info`
- `CORS_ORIGIN`: `https://app.example.com`

### Sensitive (`Secret`)

Never commit actual secret values to Git.

Required keys in secret `acquisitions-secrets`:

- `DATABASE_URL`: Target PostgreSQL connection string (must include `sslmode=require`).
- `JWT_SECRET`: Cryptographically strong 256-bit random string.
- `ARCJET_KEY`: Valid Arcjet production API key.

#### Important: Database Classification & Minikube Safety

Clearly distinguish runtime and test database targets:

| Variable            | Scope & Intended Target                    | Safety Guard Enforcement                                                                                                          |
| :------------------ | :----------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Production cluster runtime & migration Job | Used by real cluster workloads. Never blindly reused for local Kubernetes / Minikube testing.                                     |
| `TEST_DATABASE_URL` | Automated CI test suites (`NODE_ENV=test`) | Fail-closed guard (`src/config/database.js`, `tests/helpers/db.helper.js`) rejects `/neondb`, `/postgres`, or non-test databases. |

> [!CAUTION]
> **Minikube Database Isolation Rule:**
> Minikube deployment validation MUST NEVER target a production database (`neondb`, `postgres`, or databases containing real production data). Minikube validation requires an explicitly isolated non-production database (e.g. `acquisitions_test`).
> The deployment scripts (`scripts/deploy-k8s.sh` and `scripts/deploy-k8s.ps1`) actively inspect the target database pathname in-memory, safely display only the target identifier (e.g. `Database target: acquisitions_test`), and terminate immediately with a fatal error if an unsafe database is targeted.

### GHCR Pull Authentication

For private packages on GHCR, create a Docker registry secret:

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=<GITHUB_ACTOR> \
  --docker-password=<GITHUB_PAT_WITH_READ_PACKAGES> \
  --namespace=acquisitions
```

---

## 4. Database Migration & Deployment Ordering

Kubernetes does not provide automatic `depends_on` sequencing between Jobs and Deployments. The deployment workflow enforces strict ordering:

```text
1. Apply Namespace & ConfigMap
       ↓
2. Verify/Apply Secret
       ↓
3. Execute Migration Job (drizzle-kit container)
       ↓
4. Wait for Job completion (`kubectl wait --for=condition=complete`)
       ↓
5. Apply/Update Application Deployment & Service
       ↓
6. Verify Application Rollout (`kubectl rollout status`)
```

### Automated Scripts

- **Linux / macOS:** `./scripts/deploy-k8s.sh [IMAGE_TAG]`
- **Windows (PowerShell):** `.\scripts\deploy-k8s.ps1 -ImageTag "<IMAGE_TAG>"`

If the migration Job fails or encounters a database error, the script aborts immediately and the application Deployment rollout is halted.

---

## 5. Security Hardening

Pod and container specifications enforce strict defense-in-depth:

- `runAsNonRoot: true`: Containers refuse to run as UID 0 (root).
- `runAsUser: 1001`, `runAsGroup: 1001`: Dedicated unprivileged `nodejs` user.
- `allowPrivilegeEscalation: false`: Disables setuid and escalation vectors.
- `readOnlyRootFilesystem: true`: Container root filesystem is immutable.
- `capabilities: drop: ["ALL"]`: All Linux kernel capabilities dropped.
- `seccompProfile: type: RuntimeDefault`: Enforces default container syscall filtering.
- `emptyDir: {}`: Writable scratch space mounted exclusively at `/tmp`.

---

## 6. Probes & Graceful Shutdown

### Health Probes

- **Liveness Probe:** `GET /health/live` on port 3000.
  - Verifies the process is alive and responsive.
  - Does NOT query the database to prevent transient network issues from triggering restart storms.
- **Readiness Probe:** `GET /health/ready` on port 3000.
  - Performs `SELECT 1` database query.
  - Pod does not receive service traffic until database readiness is confirmed.

### Graceful Termination

- `terminationGracePeriodSeconds: 30`
- The application catches `SIGTERM` and `SIGINT`, stops accepting new connections, drains in-flight requests, and cleanly exits (with an internal 10-second safety force-exit timer).

---

## 7. Rollout & Rollback Operations

### Verifying Rollout Status

```bash
kubectl rollout status deployment/acquisitions-app -n acquisitions
```

### Checking Rollout History

```bash
kubectl rollout history deployment/acquisitions-app -n acquisitions
```

### Rolling Back to Previous Revision

```bash
kubectl rollout undo deployment/acquisitions-app -n acquisitions
kubectl rollout status deployment/acquisitions-app -n acquisitions
```

---

## 8. Terraform Baseline (`terraform/`)

The repository includes a portable Terraform configuration for provisioning cluster-level baseline resources using the official `hashicorp/kubernetes` provider:

- Creates the `acquisitions` namespace with standard labels.
- Creates the baseline `acquisitions-config` ConfigMap.
- Provides standard variables and outputs for provider-neutral environments.

### Usage

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

_(No cloud-specific provider resources are invented; cluster-level infrastructure remains strictly portable)._

---

## 9. Local Validation with Minikube

Minikube is used for local cluster infrastructure validation.

### Distinction: Local Image Validation vs. Remote GHCR Pull

- **Local Minikube Validation:** When testing locally without cluster-level internet egress or GHCR credentials, images built from source are sideloaded directly into the Minikube daemon via `minikube image load`.
- **Remote Production Cluster Pull:** Production clusters pull immutable images from GitHub Container Registry using `imagePullSecrets: [name: ghcr-pull-secret]`. The pipeline publishes both `aquisitions:<SHA>` and `aquisitions-migration:<SHA>` to GHCR for this purpose.

### Validation Steps

```bash
# 1. Start Minikube
minikube start --driver=docker

# 2. Build and load immutable images into Minikube
npm run docker:build
docker tag acquisitions-app:latest ghcr.io/pradnyan-khandakale/aquisitions:<SHA>
docker build -t ghcr.io/pradnyan-khandakale/aquisitions-migration:<SHA> --target migration .

minikube image load ghcr.io/pradnyan-khandakale/aquisitions:<SHA>
minikube image load ghcr.io/pradnyan-khandakale/aquisitions-migration:<SHA>

# 3. Create Kubernetes Secret targeting an ISOLATED TEST database (never production neondb!)
# Example:
kubectl create secret generic acquisitions-secrets -n acquisitions \
  --from-literal=DATABASE_URL="postgres://user:pass@host/acquisitions_test?sslmode=require" \
  --from-literal=JWT_SECRET="local_minikube_secure_jwt_secret_32bytes" \
  --from-literal=ARCJET_KEY="ajkey_local_mock_token_for_validation"

# 4. Execute Orchestrated Deployment (includes DB target safety gate)
./scripts/deploy-k8s.sh <SHA>
# Or in PowerShell:
# .\scripts\deploy-k8s.ps1 -ImageTag "<SHA>"

# 5. Verify in-cluster health via ClusterIP Service
kubectl run curl-test --image=curlimages/curl --rm -it --restart=Never -n acquisitions -- \
  curl -s http://acquisitions-service/health/ready
```
