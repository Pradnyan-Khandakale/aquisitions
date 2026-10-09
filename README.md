# Acquisitions API

A production-oriented, cloud-native REST API engineered for managing corporate acquisition lifecycles, deal stages, and company portfolios. Built with Node.js 22 LTS, Express 5, PostgreSQL (Neon), and Drizzle ORM, this project emphasizes enterprise-grade DevOps practices, zero-leak observability, immutable Git SHA container releases, and hardened Kubernetes orchestration.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
- [Authentication & Authorization](#authentication--authorization)
- [Acquisition Lifecycle Engine](#acquisition-lifecycle-engine)
- [Database Schema & Migrations](#database-schema--migrations)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Testing & Quality Gates](#testing--quality-gates)
- [Docker Architecture](#docker-architecture)
- [Kubernetes Orchestration](#kubernetes-orchestration)
- [Kubernetes Security Hardening](#kubernetes-security-hardening)
- [CI/CD Release Pipeline](#cicd-release-pipeline)
- [Observability & Request Correlation](#observability--request-correlation)
- [Health Check Semantics](#health-check-semantics)
- [Operational Smoke Testing](#operational-smoke-testing)
- [Infrastructure as Code (Terraform)](#infrastructure-as-code-terraform)
- [Security Baseline](#security-baseline)
- [Operations & Rollback Runbook](#operations--rollback-runbook)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Production Readiness Assessment](#production-readiness-assessment)
- [Deployment Quick Reference](#deployment-quick-reference)
- [Security & Secrets Warning](#security--secrets-warning)
- [License](#license)
- [Author & Repository](#author--repository)

---

## Key Features

- **Robust REST API:** Full CRUD operations for Companies, Deal Stages, and Acquisitions with Express 5 on Node.js 22 LTS.
- **Secure Authentication:** Stateless JWT session handling supporting HTTP-only cookies and `Authorization: Bearer` headers, bcrypt password hashing, and strict role privilege controls.
- **Stateful Acquisition Lifecycle Engine:** Sequential deal stage progression, terminal stage protections, prerequisite business gates (valuation required for closing), and concurrency conflict prevention.
- **Strict Validation:** Runtime request payload validation via Zod schemas with centralized, structured error responses.
- **Cloud-Native Database:** Serverless PostgreSQL via Neon with connection pooling (`@neondatabase/serverless`) and Drizzle ORM migrations.
- **Enterprise Observability:** Winston structured JSON logging in production, decoupled HTTP access logging (Morgan), end-to-end request correlation (`x-request-id`) via Node.js `AsyncLocalStorage`, and zero-leak sensitive data redaction.
- **Decoupled Health Probes:** Separate process liveness (`/health/live`) and deep database readiness (`/health/ready`) probes preventing cascading failure loops.
- **Multi-Stage Docker Images:** Alpine-based multi-stage builds producing dedicated, vulnerability-free application runtime and migration runner images executed as non-root (UID 1001).
- **Hardened Kubernetes Manifests:** Declarative Kustomize manifests featuring 2 replicas, rolling updates (`maxUnavailable: 0`), PodDisruptionBudget, read-only root filesystems, dropped capabilities, and `RuntimeDefault` seccomp profiles.
- **Immutable Release Discipline:** Release deployment model binding application and migration workloads to the exact same scanned Git commit SHA, prohibiting `:latest`.
- **Automated CI/CD Pipeline:** GitHub Actions workflow executing quality gates (format, lint, unit/integration tests with coverage, npm audit), building multi-target Docker images, running Aqua Trivy vulnerability and secret scans, and publishing to GHCR.
- **Automated Operational Smoke Tests:** End-to-end smoke verification scripts (PowerShell & Bash) validating liveness, readiness, request correlation, auth flows, protected APIs, CRUD lifecycles, and error responses.

---

## Architecture

### System & Request Flow Architecture

```mermaid
graph TD
    Client[Client / Ingress Controller] -->|HTTP/HTTPS Port 80/443| Svc[Kubernetes Service: acquisitions-service]
    Svc -->|ClusterIP Port 80 -> 3000| Pods[Acquisitions API Pod Replicas 1 & 2]

    subgraph "Acquisitions API Pod (Node.js 22 LTS)"
        direction TB
        ReqId[Request ID Middleware\nAsyncLocalStorage UUID v4]
        SecMW[Security Middleware\nHelmet, CORS, Arcjet]
        Router[Express Router]
        AuthMW[Authentication & Role Guard\nJWT & Cookie / Bearer]
        ValMW[Zod Request Validation]
        ServiceLayer[Business Services\nAcquisition Lifecycle Engine]
        ObsEngine[Observability & Zero-Leak Redactor\nWinston JSON Logger]

        ReqId --> SecMW
        SecMW --> Router
        Router --> AuthMW
        AuthMW --> ValMW
        ValMW --> ServiceLayer
        ServiceLayer --> ObsEngine
    end

    ServiceLayer -->|Drizzle ORM / Connection Pool| DB[(PostgreSQL / Neon Cloud)]
```

### CI/CD & Immutable Deployment Lifecycle

```mermaid
graph LR
    GitCommit[Git Commit SHA] --> GHA[GitHub Actions CI/CD]
    GHA --> Gates[Quality Gates\nFormat, Lint, Tests, Audit]
    Gates --> DockerBuild[Docker Multi-Stage Build\nApp & Migration Images]
    DockerBuild --> TrivyScan[Aqua Trivy Scan\nVulnerabilities & Secrets]
    TrivyScan --> GHCR[GHCR Publication\nTagged with Git SHA]
    GHCR --> K8sDeploy[Kubernetes Orchestration\nTransient Kustomize Overlay]
    K8sDeploy --> MigJob[1. Migration Job\ndrizzle-kit migrate]
    MigJob -->|Complete| AppRollout[2. Rolling Deployment\nacquisitions-app]
```

---

## Technology Stack

| Layer                      | Technology        | Details / Version                                                        |
| :------------------------- | :---------------- | :----------------------------------------------------------------------- |
| **Runtime**                | Node.js           | v22 LTS (Native ECMAScript Modules)                                      |
| **Framework**              | Express           | v5.2.1                                                                   |
| **Database**               | PostgreSQL        | Neon Serverless Postgres via `@neondatabase/serverless` v1.0.2           |
| **ORM & Migrations**       | Drizzle ORM       | `drizzle-orm` v0.45.1 & `drizzle-kit` v0.31.10                           |
| **Validation**             | Zod               | v4.3.6                                                                   |
| **Authentication**         | JWT & bcrypt      | `jsonwebtoken` v9.0.3, `bcrypt` v6.0.0, `cookie-parser` v1.4.7           |
| **Security Shield**        | Arcjet & Helmet   | `@arcjet/node` v1.3.1, `@arcjet/inspect`, `helmet` v8.1.0, `cors` v2.8.6 |
| **Logging & Correlation**  | Winston & Morgan  | `winston` v3.19.0, `morgan` v1.10.1, Node.js `AsyncLocalStorage`         |
| **Automated Testing**      | Jest & Supertest  | `jest` v30.5.2 (ESM VM modules), `supertest` v7.3.1                      |
| **Linting & Formatting**   | ESLint & Prettier | `eslint` v10.1.0, `prettier` v3.8.1                                      |
| **Containerization**       | Docker            | Alpine multi-stage (`node:22-alpine`), Docker Compose                    |
| **Container Registry**     | GHCR              | GitHub Container Registry (`ghcr.io`)                                    |
| **Security Scanning**      | Aqua Trivy & npm  | Aqua Security Trivy v0.75.0, `npm audit --audit-level=high`              |
| **Orchestration**          | Kubernetes        | Native manifests, Kustomize v1beta1, Minikube validation                 |
| **Infrastructure as Code** | Terraform         | HashiCorp Terraform with `hashicorp/kubernetes` provider                 |

---

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci-cd.yml             # GitHub Actions CI/CD release pipeline
├── drizzle/                      # Generated SQL migration files and schema snapshots
│   ├── 0000_violet_metal_master.sql
│   ├── 0001_fine_silhouette.sql
│   └── meta/
├── k8s/                          # Declarative Kubernetes manifests
│   ├── configmap.yaml            # Non-sensitive runtime configuration
│   ├── deployment.yaml           # Hardened application Deployment (2 replicas)
│   ├── ingress.yaml              # Ingress routing api.example.com
│   ├── kustomization.yaml        # Kustomize manifest with tag-required baseline
│   ├── migration-job.yaml        # Pre-rollout database migration Job
│   ├── namespace.yaml            # Dedicated 'acquisitions' namespace
│   ├── pdb.yaml                  # PodDisruptionBudget (minAvailable: 1)
│   ├── registry-secret.example.yaml # Template for GHCR container pull secret
│   ├── secret.example.yaml       # Template for runtime Kubernetes secrets
│   └── service.yaml              # Internal ClusterIP Service (port 80 -> 3000)
├── scripts/                      # Operational automation scripts
│   ├── deploy-k8s.ps1            # PowerShell Kubernetes deployment orchestrator
│   ├── deploy-k8s.sh             # Bash Kubernetes deployment orchestrator
│   ├── dev.sh                    # Local Docker development launcher with Neon Local
│   ├── prod.sh                   # Local Docker production simulation launcher
│   ├── smoke-test.ps1            # 7-step operational smoke test suite (PowerShell)
│   └── smoke-test.sh             # 7-step operational smoke test suite (Bash)
├── src/
│   ├── config/                   # Configuration modules (database, logger, arcjet)
│   ├── controllers/              # HTTP route handlers (auth, company, stage, acquisition)
│   ├── middleware/               # Express middleware (auth, error, request-id, security)
│   ├── models/                   # Drizzle ORM table definitions and relational schemas
│   ├── routes/                   # Express route definitions
│   ├── services/                 # Core business logic and acquisition lifecycle engine
│   ├── utils/                    # Shared utilities (JWT, cookies, redaction, request-context)
│   ├── validations/              # Zod validation schemas
│   ├── app.js                    # Express application factory and middleware pipeline
│   ├── index.js                  # Application entry point loading environment
│   └── server.js                 # HTTP listener and graceful shutdown signals
├── terraform/                    # Terraform baseline for Kubernetes namespace and ConfigMap
│   ├── main.tf
│   ├── outputs.tf
│   ├── variables.tf
│   └── versions.tf
├── tests/                        # Comprehensive automated test suite (12 suites, 121 tests)
│   ├── acquisitions/             # Acquisition CRUD and lifecycle transition tests
│   ├── auth/                     # Signup, signin, token verification, and middleware tests
│   ├── companies/                # Company management tests
│   ├── deal-stages/              # Deal stage ordering and constraint tests
│   ├── health/                   # Liveness and readiness probe tests
│   ├── helpers/                  # Test database teardown and seed utilities
│   ├── observability/            # Request correlation and log redaction tests
│   └── security/                 # Invariant safety, role escalation, and validation tests
├── .env.example                  # Template for local environment variables
├── .trivyignore                  # Trivy container scanner ignore configuration
├── docker-compose.dev.yml        # Development environment with Neon Local proxy
├── docker-compose.prod.yml       # Production container simulation Compose file
├── Dockerfile                    # Multi-stage Docker build file (dev, builder, migration, prod)
├── drizzle.config.js             # Drizzle Kit migration configuration
├── eslint.config.js              # ESLint configuration
├── jest.config.js               # Jest configuration for ECMAScript Modules
├── K8S_SETUP.md                  # Detailed Kubernetes architecture & validation guide
├── OPERATIONS.md                 # Production operational runbook and go-live guide
├── package.json                  # Dependencies, npm scripts, and engine specifications
└── SECURITY.md                   # Security policy, secrets handling, and remediation baseline
```

---

## API Overview

All application routes are prefixed with `/api` unless otherwise noted.

### Health Probes

| Method | Endpoint        | Auth | Purpose                                                                  |
| :----- | :-------------- | :--- | :----------------------------------------------------------------------- |
| `GET`  | `/health/live`  | None | Lightweight liveness probe reporting process uptime and timestamp        |
| `GET`  | `/health/ready` | None | Deep readiness probe verifying active database connectivity (`SELECT 1`) |
| `GET`  | `/health`       | None | Backward-compatible alias for process liveness                           |

### Authentication

| Method | Endpoint             | Auth | Purpose                                                                         |
| :----- | :------------------- | :--- | :------------------------------------------------------------------------------ |
| `POST` | `/api/auth/sign-up`  | None | Register a new user (role is strictly enforced as `user`)                       |
| `POST` | `/api/auth/sign-in`  | None | Authenticate credentials; sets HTTP-only session cookie and returns user record |
| `POST` | `/api/auth/sign-out` | None | Clear authenticated session cookie                                              |

### Companies

| Method   | Endpoint             | Auth          | Purpose                                              |
| :------- | :------------------- | :------------ | :--------------------------------------------------- |
| `POST`   | `/api/companies`     | None / Arcjet | Create a new portfolio target company                |
| `GET`    | `/api/companies`     | None / Arcjet | List all companies with count                        |
| `GET`    | `/api/companies/:id` | None / Arcjet | Retrieve company details by numeric ID               |
| `PATCH`  | `/api/companies/:id` | None / Arcjet | Partially update company metadata                    |
| `DELETE` | `/api/companies/:id` | None / Arcjet | Delete company (cascades to associated acquisitions) |

### Deal Stages

| Method   | Endpoint               | Auth          | Purpose                                                               |
| :------- | :--------------------- | :------------ | :-------------------------------------------------------------------- |
| `POST`   | `/api/deal-stages`     | None / Arcjet | Create a new lifecycle deal stage with sequence order                 |
| `GET`    | `/api/deal-stages`     | None / Arcjet | List all deal stages ordered by sequence ascending                    |
| `GET`    | `/api/deal-stages/:id` | None / Arcjet | Retrieve deal stage details by numeric ID                             |
| `PATCH`  | `/api/deal-stages/:id` | None / Arcjet | Update deal stage name, sequence, or description                      |
| `DELETE` | `/api/deal-stages/:id` | None / Arcjet | Delete an unused deal stage (protected if referenced by acquisitions) |

### Acquisitions

| Method   | Endpoint                      | Auth          | Purpose                                                                         |
| :------- | :---------------------------- | :------------ | :------------------------------------------------------------------------------ |
| `POST`   | `/api/acquisitions`           | Optional      | Create acquisition record (binds `created_by` to authenticated user if present) |
| `GET`    | `/api/acquisitions`           | None / Arcjet | List all acquisitions with joined company, stage, and user data                 |
| `GET`    | `/api/acquisitions/:id`       | None / Arcjet | Retrieve acquisition details with joined relational data                        |
| `PATCH`  | `/api/acquisitions/:id`       | Optional      | Update acquisition metadata (stage modification strictly prohibited here)       |
| `PATCH`  | `/api/acquisitions/:id/stage` | **Required**  | **Execute validated lifecycle stage transition** (owner/admin only)             |
| `DELETE` | `/api/acquisitions/:id`       | Optional      | Delete an acquisition record                                                    |

---

## Authentication & Authorization

The authentication subsystem is implemented in `src/controllers/auth.controller.js`, `src/services/auth.service.js`, and `src/middleware/auth.middleware.js`:

1. **Password Hashing:** Passwords are salted and hashed using `bcrypt` with 10 salt rounds prior to persistence. Raw passwords are never stored or returned in responses.
2. **Stateless JWT Issuance:** On signup or signin, a signed JSON Web Token is issued containing the user ID, email, and role, signed with `JWT_SECRET` and expiring after 24 hours.
3. **Dual Transport Support:** The `authenticate` middleware extracts JWTs from:
   - Secure HTTP-only cookies (`token`);
   - HTTP Authorization headers (`Authorization: Bearer <token>`).
4. **Privilege Escalation Prevention:** The public signup endpoint unconditionally assigns `role: 'user'`, explicitly ignoring any client-supplied `role` attributes to prevent privilege escalation.
5. **Ownership & Admin Authorization:** Sensitive actions such as acquisition stage transitions require authentication and verify that `req.user.role === 'admin'` or `acquisition.created_by === req.user.id`.

---

## Acquisition Lifecycle Engine

The Acquisition Lifecycle Engine (`src/services/acquisition-lifecycle.service.js`) governs how corporate acquisition records transition across pipeline stages:

```mermaid
stateDiagram-v2
    [*] --> Draft: Created
    Draft --> Review: Sequential Next
    Review --> DueDiligence: Sequential Next
    DueDiligence --> Negotiation: Sequential Next
    Negotiation --> Approved: Prerequisite: Valuation > 0
    Approved --> Closed: Prerequisite: Valuation > 0
    Closed --> [*]: Terminal Stage

    Draft --> Rejected: Rejection Shortcut
    Review --> Rejected: Rejection Shortcut
    DueDiligence --> Rejected: Rejection Shortcut
    Negotiation --> Rejected: Rejection Shortcut
    Approved --> Rejected: Rejection Shortcut
    Rejected --> [*]: Terminal Stage
```

### Business Rules & Invariants

- **Dedicated Transition Endpoint:** Deal stages cannot be modified via generic `PATCH /api/acquisitions/:id`. The schema actively strips stage fields, forcing all state transitions through `PATCH /api/acquisitions/:id/stage`.
- **Sequential Forward Progression:** Acquisitions must advance one sequence step at a time (e.g., Draft -> Review). Arbitrary jumps (e.g., Draft -> Negotiation) are rejected with `409 Conflict`.
- **No Backward Transitions:** Reverting to an earlier stage in the pipeline is rejected with `409 Conflict`.
- **Rejection Shortcuts:** Active deals may transition directly to terminal rejection/cancellation stages (`rejected`, `cancelled`, `abandoned`, `closed lost`) from any non-terminal stage.
- **Terminal Stage Locking:** Once an acquisition enters a terminal stage (`closed`, `rejected`), no further stage transitions are permitted.
- **Valuation Prerequisite Gate:** Transitioning into approval or closing stages (`approved`, `closed`, `closed won`) requires an `estimated_value` greater than 0; otherwise rejected with `422 Unprocessable Entity`.
- **Atomic Concurrency Protection:** Stage transitions execute an atomic SQL update conditioned on the expected current stage (`WHERE id = ? AND deal_stage_id = ?`). If a concurrent operation modified the deal, the update returns zero rows and fails with `409 Conflict`.

---

## Database Schema & Migrations

The database is built on PostgreSQL (Neon) using Drizzle ORM. Entity definitions reside in `src/models/` and schema migrations in `drizzle/`.

```mermaid
erDiagram
    users ||--o{ acquisitions : "creates"
    companies ||--o{ acquisitions : "target_company"
    deal_stages ||--o{ acquisitions : "current_stage"

    users {
        serial id PK
        varchar name
        varchar email UK
        varchar password
        varchar role
        timestamp created_at
        timestamp updated_at
    }

    companies {
        serial id PK
        varchar name UK
        text description
        varchar industry
        varchar website
        timestamp created_at
        timestamp updated_at
    }

    deal_stages {
        serial id PK
        varchar name UK
        text description
        integer sequence
        timestamp created_at
        timestamp updated_at
    }

    acquisitions {
        serial id PK
        varchar title
        text description
        integer company_id FK
        integer deal_stage_id FK
        varchar status
        numeric estimated_value
        timestamp target_close_date
        integer created_by FK
        timestamp created_at
        timestamp updated_at
    }
```

### Relational Constraints

- `acquisitions.company_id` references `companies.id` with `ON DELETE CASCADE`.
- `acquisitions.deal_stage_id` references `deal_stages.id` with `ON DELETE RESTRICT` (preventing deletion of stages currently in use).
- `acquisitions.created_by` references `users.id` with `ON DELETE SET NULL`.
- Indexed fields: `company_id`, `deal_stage_id`, `created_by`, and `status`.

### Migration Execution

- **Local / CLI:** `npm run db:migrate` (via `drizzle-kit migrate`).
- **Kubernetes:** Executed prior to application rollout via a dedicated one-off Kubernetes Job (`k8s/migration-job.yaml`) running the migration container image.

---

## Environment Configuration

Configuration is managed via environment variables. Copy `.env.example` to create local configuration files:

```bash
cp .env.example .env.development
```

### Configuration Parameters

| Variable           | Description                                               | Default / Example                     | Required In    |
| :----------------- | :-------------------------------------------------------- | :------------------------------------ | :------------- |
| `PORT`             | HTTP server listening port                                | `3000`                                | All            |
| `NODE_ENV`         | Runtime environment mode                                  | `development` / `production` / `test` | All            |
| `LOG_LEVEL`        | Minimum logging level (`debug`, `info`, `warn`, `error`)  | `info` (`error` in test)              | All            |
| `CORS_ORIGIN`      | Allowed CORS origin URL                                   | `http://localhost:3000`               | All            |
| `DATABASE_URL`     | PostgreSQL connection string (`sslmode=require` in cloud) | `postgresql://user:pass@host/db`      | All            |
| `JWT_SECRET`       | Secret key for signing and verifying JSON Web Tokens      | 256-bit random string                 | All            |
| `ARCJET_KEY`       | License/API key for Arcjet security rate-limiting         | `ajkey_...`                           | All            |
| `NEON_API_KEY`     | Neon Cloud API key (for Neon Local proxy)                 | `napi_...`                            | Dev (optional) |
| `NEON_PROJECT_ID`  | Neon Project identifier                                   | `project_id`                          | Dev (optional) |
| `PARENT_BRANCH_ID` | Neon parent branch for ephemeral dev branches             | `main`                                | Dev (optional) |

> [!CAUTION]
> Never commit `.env`, `.env.development`, or `.env.production` files to version control. Production secrets must be injected at runtime via Kubernetes Secrets or a cloud secret manager. See [SECURITY.md](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/SECURITY.md).

---

## Local Development

### Prerequisites

- Node.js >= 22.0.0
- npm >= 10.0.0
- Docker Desktop (optional, for containerized development)

### Standard Local Setup (Host Node.js)

1. **Clone and install dependencies:**

   ```bash
   git clone https://github.com/Pradnyan-Khandakale/aquisitions.git
   cd aquisitions
   npm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env.development
   # Edit .env.development with your database credentials and secrets
   ```

3. **Run database migrations:**

   ```bash
   npm run db:migrate
   ```

4. **Start the application in development mode (hot-reload via `node --watch`):**
   ```bash
   npm run dev
   ```
   The API will listen on `http://localhost:3000`.

### Containerized Development with Neon Local Proxy

For isolated local container development with an ephemeral database branch:

```bash
# Windows / Linux / macOS
npm run docker:dev
# Alternatively: sh ./scripts/dev.sh
```

This launches `docker-compose.dev.yml`, waits for the database proxy healthcheck, runs Drizzle migrations, and attaches hot-reload application logs.

---

## Testing & Quality Gates

The repository maintains an automated testing suite and quality gates to guarantee stability, security, and backward compatibility.

### Quality Gate Commands

```bash
# 1. Verify code formatting with Prettier
npm run format:check

# 2. Run static code analysis with ESLint
npm run lint

# 3. Execute test suite with code coverage
npm run test:coverage

# 4. Check dependencies for high/critical security vulnerabilities
npm run audit:check

# 5. Composite Quality Gate (executes all 4 gates in sequence)
npm run quality
```

### Verified Test Suite Status

- **Total Test Suites:** 12 passed / 12 total
- **Total Tests:** 121 passed / 121 total (0 snapshots)
- **Coverage Metrics:**
  - **Statements:** 81.41% (Threshold: 70%)
  - **Branches:** 72.60% (Threshold: 70%)
  - **Functions:** 83.14% (Threshold: 70%)
  - **Lines:** 82.06% (Threshold: 70%)

---

## Docker Architecture

The project utilizes a multi-stage [Dockerfile](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/Dockerfile) based on `node:22-alpine` to maintain minimal image sizes and eliminate dev-tooling vulnerabilities from production containers:

### Docker Multi-Stage Targets

1. `base`: Prepares the `/app` workspace and copies package definitions.
2. `builder`: Installs production dependencies (`npm ci --omit=dev`) and explicitly strips CLI/build tooling (`drizzle-kit`, `tsx`, `esbuild`) to prevent scanner vulnerabilities.
3. `migration`: Dedicated migration runner containing `drizzle-kit` and schema files. Configured with non-root user `nodejs` (UID 1001) executing `npm run db:migrate`.
4. `development`: Installs complete dependencies (including devDependencies) for local volume mounting and hot-reload development.
5. `production`: Minimal runtime container copying stripped dependencies from `builder`, running as non-root user `nodejs` (UID 1001), with a native `HEALTHCHECK` probe against `/health/live`.

### Building and Scanning Images

```bash
# Build production application image
docker build --target production -t acquisitions-app:local .

# Build migration runner image
docker build --target migration -t acquisitions-migration:local .

# Run vulnerability scan with Aqua Trivy
trivy image --severity HIGH,CRITICAL acquisitions-app:local
```

---

## Kubernetes Orchestration

Deployments target a dedicated namespace (`acquisitions`) using declarative manifests in `k8s/`.

### Workload Inventory

- **Namespace:** `k8s/namespace.yaml` (`acquisitions`)
- **ConfigMap:** `k8s/configmap.yaml` (`acquisitions-config`)
- **Secrets:** `k8s/secret.example.yaml` (`acquisitions-secrets`)
- **Migration Job:** `k8s/migration-job.yaml` (`acquisitions-migration`)
- **Deployment:** `k8s/deployment.yaml` (`acquisitions-app`, 2 replicas)
- **Service:** `k8s/service.yaml` (`acquisitions-service`, ClusterIP port 80 -> 3000)
- **Ingress:** `k8s/ingress.yaml` (`acquisitions-ingress`, routing `api.example.com`)
- **PodDisruptionBudget:** `k8s/pdb.yaml` (`minAvailable: 1`)

### Immutable Image Tagging & Transient Overlay Model

Deployments **never** use the rolling `:latest` tag. The tracked [k8s/kustomization.yaml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/k8s/kustomization.yaml) maintains `tag-required` as a safety baseline.

Deployment orchestration scripts dynamically inject the authoritative Git commit SHA using an ephemeral Kustomize overlay:

```bash
# Deploy on Linux/macOS
./scripts/deploy-k8s.sh --image-tag "<GIT_COMMIT_SHA>"

# Deploy on Windows PowerShell
.\scripts\deploy-k8s.ps1 -ImageTag "<GIT_COMMIT_SHA>"
```

### Deployment Sequencing

1. Verifies that the namespace and secrets exist, and validates that `DATABASE_URL` is an approved target.
2. Generates a temporary Kustomize overlay setting `newTag: <GIT_COMMIT_SHA>` for both application and migration images.
3. Executes the migration Job and blocks until completion (`kubectl wait --for=condition=complete job/acquisitions-migration`).
4. Rolls out application workloads with rolling update strategy (`maxSurge: 1`, `maxUnavailable: 0`).
5. Verifies rollout health (`kubectl rollout status deployment/acquisitions-app`).

For detailed Minikube setup instructions, see [K8S_SETUP.md](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/K8S_SETUP.md).

---

## Kubernetes Security Hardening

Workloads comply with the Kubernetes Restricted Pod Security Standards:

- **Non-Root Execution:** Pods run as non-root user `1001` (`runAsNonRoot: true`, `runAsUser: 1001`, `runAsGroup: 1001`, `fsGroup: 1001`).
- **Read-Only Root Filesystem:** Container filesystems are strictly read-only (`readOnlyRootFilesystem: true`). Writable scratch space is limited to an explicit `emptyDir` mounted at `/tmp`.
- **Privilege Restrictions:** Privilege escalation is forbidden (`allowPrivilegeEscalation: false`).
- **Capability Dropping:** All Linux capabilities are dropped (`capabilities.drop: ["ALL"]`).
- **Seccomp Profile:** Enforced default profile (`seccompProfile.type: "RuntimeDefault"`).
- **High Availability:** Protected by a `PodDisruptionBudget` ensuring at least 1 healthy pod remains available during voluntary disruptions.
- **Resource Boundaries:** CPU requests: `100m`, limits: `500m`; Memory requests: `128Mi`, limits: `512Mi`.

---

## CI/CD Release Pipeline

Continuous integration and continuous delivery are managed via GitHub Actions ([.github/workflows/ci-cd.yml](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/.github/workflows/ci-cd.yml)):

```text
Pull Request / Main Push
           ↓
Job 1: Code Quality & Security Gates
  ├── npm ci (Node.js 22 LTS)
  ├── Preflight TEST_DATABASE_URL check
  └── npm run quality (Prettier, ESLint, Jest coverage, npm audit)
           ↓
Job 2: Docker Build, Security Scan & GHCR Release
  ├── Checkout source
  ├── Build production image (tagged with GITHUB_SHA)
  ├── Build migration image (tagged with GITHUB_SHA)
  ├── Trivy scan application image (exit-code 1 on HIGH/CRITICAL)
  ├── Trivy scan migration image (exit-code 1 on HIGH/CRITICAL)
  └── Publish scanned images to GHCR (main push only)
```

Both images share the exact same `${GITHUB_SHA}` tag. Images are published to GHCR only after all quality gates and container security scans pass with exit code 0.

---

## Observability & Request Correlation

### Structured JSON Logging

In production (`NODE_ENV=production`), Winston formats all application logs as single-line JSON objects emitted to `stdout`/`stderr`.

```json
{
  "level": "info",
  "message": "HTTP POST /api/deal-stages 201",
  "method": "POST",
  "path": "/api/deal-stages",
  "status": 201,
  "durationMs": 42.15,
  "requestId": "19d1e140-0497-4005-a9ce-9d4b248d923d",
  "ip": "::ffff:127.0.0.1",
  "userAgent": "Mozilla/5.0 ...",
  "service": "acquisitions-api",
  "environment": "production",
  "version": "1.0.0",
  "timestamp": "2026-10-08T15:12:31.766Z"
}
```

### End-to-End Request Correlation

- Every incoming request is assigned an RFC 4122 UUID v4 correlation ID (`x-request-id` header). If the caller provides one, it is preserved; otherwise, a fresh ID is generated.
- The ID is stored in Node.js `AsyncLocalStorage` (`src/utils/request-context.js`), automatically attaching to downstream Winston logs without manual parameter passing.
- The `x-request-id` is returned in all response headers and embedded in error payloads.

### Zero-Leak Redaction Engine

Implemented in `src/utils/redact.js`, all log data is recursively sanitized before printing:

- **Database URLs:** Usernames and passwords in PostgreSQL connection strings are replaced with `[REDACTED]`.
- **JWTs & Secrets:** Bearer tokens, JWT strings (`eyJh...`), and Arcjet keys (`ajkey_...`) are replaced with `[REDACTED_JWT]` and `[REDACTED_ARCJET_KEY]`.
- **Sensitive Fields:** Keys matching `password`, `token`, `secret`, `cookie`, or `authorization` are masked.

---

## Health Check Semantics

The API defines decoupled health probe endpoints in `src/app.js`:

```text
GET /health/live
----------------
Purpose:   Answers "Is the Node.js event-loop running and responding to I/O?"
Checks:    Process uptime, local timestamp.
Rule:      Completely decoupled from database or external dependencies.
Failure:   Triggers Kubernetes Pod restart.

GET /health/ready
-----------------
Purpose:   Answers "Can this pod safely serve traffic?"
Checks:    Active PostgreSQL connection via 'SELECT 1'.
Behavior:  Returns 200 READY when connected, 503 NOT_READY if connection fails.
Failure:   Removes pod from Kubernetes Service endpoints without restarting it.
```

---

## Operational Smoke Testing

The repository provides automated operational smoke-test scripts to validate running deployments:

- PowerShell: `scripts/smoke-test.ps1`
- Bash: `scripts/smoke-test.sh`

### Executing Smoke Tests

```bash
# Against Minikube (PowerShell with automated port-forwarding):
.\scripts\smoke-test.ps1 -PortForward

# Against remote or existing local endpoint:
./scripts/smoke-test.sh http://localhost:3000
```

### Automated Verification Stages

1. **Liveness Probe:** Validates `/health/live` returns 200 OK.
2. **Request ID Propagation:** Confirms `x-request-id` echoes back in headers.
3. **Readiness Probe:** Validates `/health/ready` returns 200 READY and database is connected.
4. **Authentication Flow:** Signs up a unique test operator and captures session cookies.
5. **Protected API Access:** Confirms session access to `GET /api/deal-stages`.
6. **Acquisition CRUD Lifecycle:** Creates target company, creates acquisition, and verifies retrieval.
7. **Client Error Handling:** Submits invalid credentials and verifies 401 response with correlated request ID.

---

## Infrastructure as Code (Terraform)

Terraform configurations reside in `terraform/` using the HashiCorp `kubernetes` provider:

### What Terraform Manages

- **Namespace:** Creates the `acquisitions` namespace with standard ownership and environment labels.
- **ConfigMap:** Generates the `acquisitions-config` ConfigMap containing non-sensitive runtime parameters (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN`).

### What Terraform Does NOT Manage

- **Neon Database Provisioning:** Neon projects, databases, branches, and compute endpoints are provisioned via Neon Cloud or the Neon CLI.
- **Sensitive Secrets:** Secrets (`acquisitions-secrets`) are managed via Kubernetes secret templates or external secret stores.
- **Application Workloads:** Deployments, Services, Ingresses, PDBs, and Migration Jobs are deployed via Kustomize and the release orchestration scripts.

---

## Security Baseline

- **Input Sanitization:** All request parameters, queries, and bodies are validated against strict Zod schemas.
- **Secure HTTP Headers:** Configured with `helmet` for defense against clickjacking, MIME-sniffing, and cross-site scripting.
- **CORS Protection:** Enforces origin whitelisting via `cors`.
- **Arcjet Security Shield:** Live rate-limiting, bot detection, and attack protection applied via `src/middleware/security.middleware.js`.
- **Dependency Auditing:** Continuous scanning with `npm audit --audit-level=high`.
- **Container Vulnerability Scanning:** Automated scanning in CI/CD via Aqua Trivy checking for OS and package vulnerabilities as well as embedded secrets.

For full details, see [SECURITY.md](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/SECURITY.md).

---

## Operations & Rollback Runbook

For complete operational procedures, consult [OPERATIONS.md](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/OPERATIONS.md).

### Safe Rollback Procedure

If a production issue occurs, **always roll back to a previously validated immutable Git commit SHA**:

```bash
# Linux / macOS
./scripts/deploy-k8s.sh --image-tag "<PREVIOUS_GOOD_SHA>"

# Windows PowerShell
.\scripts\deploy-k8s.ps1 -ImageTag "<PREVIOUS_GOOD_SHA>"
```

> [!CAUTION]
> Do NOT use `kubectl rollout undo deployment/acquisitions-app`. A native rollout undo bypasses database migration tracking and risks schema-application version desynchronization.

### Secret Rotation Procedure

Update the Kubernetes secret and trigger a rolling restart without downtime:

```bash
kubectl create secret generic acquisitions-secrets -n acquisitions \
  --from-literal="DATABASE_URL=<NEW_URL>" \
  --from-literal="JWT_SECRET=<NEW_JWT_SECRET>" \
  --from-literal="ARCJET_KEY=<NEW_ARCJET_KEY>" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/acquisitions-app -n acquisitions
kubectl rollout status deployment/acquisitions-app -n acquisitions
```

---

## Backup & Disaster Recovery

- **Neon Point-in-Time Restore (PITR):** Neon serverless PostgreSQL natively maintains WAL logs and branch snapshots, supporting instant restoration to arbitrary timestamps via the Neon Console. _(Cloud provider capability)_
- **Logical Backups:** On-demand logical SQL dumps can be captured via `pg_dump`:
  ```bash
  pg_dump "$DATABASE_URL" --format=custom --file=acquisitions_backup.dump
  ```
- **Database Target Validation:** The deployment orchestration scripts enforce automated pre-flight checks rejecting default (`neondb`, `postgres`) or production databases during test validation runs.
- **Disaster Recovery Status:** Backup creation and logical dumps are verified. Complete end-to-end disaster recovery restore workflows have not yet been validated against a live production failover cluster.

---

## Production Readiness Assessment

| Evaluation Area             | Status               | Verification Evidence                                                    |
| :-------------------------- | :------------------- | :----------------------------------------------------------------------- |
| **Application Core**        | Implemented          | Node.js 22 / Express 5 API with CRUD & acquisition lifecycle             |
| **Authentication & AuthZ**  | Implemented          | JWT + cookie/bearer, bcrypt, role isolation, privilege protection        |
| **Automated Testing**       | Passing              | 12/12 suites, 121/121 tests passing locally and in CI/CD                 |
| **Code Quality Gates**      | Passing              | Prettier, ESLint, and npm audit (high/critical) passing cleanly          |
| **Code Coverage**           | Passing              | 81.41% statements, 72.60% branches, 83.14% functions, 82.06% lines       |
| **Container Scanning**      | Passing              | Aqua Trivy vulnerability & secret scan passing with exit code 0          |
| **CI/CD Automation**        | Verified in CI/CD    | GitHub Actions release pipeline building and scanning on push            |
| **Kubernetes Workload**     | Verified in Minikube | 2/2 healthy pods, PDB active, non-root 1001, read-only rootfs            |
| **Observability**           | Implemented          | Structured JSON logs, AsyncLocalStorage correlation, zero-leak redaction |
| **Operational Smoke Tests** | Passing              | 7/7 automated smoke tests passing against live Minikube cluster          |
| **Rollback Runbook**        | Validated            | Tested immutable Git SHA rollback orchestration procedure                |
| **Backup / DR**             | Provider-dependent   | Neon PITR supported; live production restore drill not executed          |
| **Production Deployment**   | Pending Target       | Validated in Minikube; awaits live cloud Kubernetes cluster target       |

---

## Deployment Quick Reference

```bash
# 1. Run local quality gates
npm run quality

# 2. Deploy to Kubernetes with immutable Git SHA
./scripts/deploy-k8s.sh --image-tag "$(git rev-parse HEAD)"

# 3. Verify application rollout
kubectl rollout status deployment/acquisitions-app -n acquisitions

# 4. Execute operational smoke test
./scripts/smoke-test.sh http://localhost:3000

# 5. Inspect structured JSON logs
kubectl logs -n acquisitions -l app.kubernetes.io/name=acquisitions-api --tail=100
```

---

## Security & Secrets Warning

> [!WARNING]
> Never commit `.env` files, production database connection strings, API keys, JWT secrets, Kubernetes secret manifests, or certificates to version control. Always maintain sensitive data in external secret managers or Kubernetes Secrets. Refer to [SECURITY.md](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/SECURITY.md) for the security policy.

---

## License

This project is licensed under the [ISC License]

---

## Author & Repository

- **Repository:** [Pradnyan-Khandakale/aquisitions](https://github.com/Pradnyan-Khandakale/aquisitions)
- **Issues & Tracking:** [GitHub Issues](https://github.com/Pradnyan-Khandakale/aquisitions/issues)
