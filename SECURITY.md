# Security Policy & Secrets Management Baseline

## 1. Secrets Management Policy

### Tracked vs Untracked Files

- **Tracked in Git:** ONLY safe template files containing non-sensitive placeholders (e.g., `.env.example`).
- **Strictly Untracked (Ignored):**
  - `.env`
  - `.env.*` (e.g., `.env.development`, `.env.production`, `.env.local`)
  - `logs/` and all `*.log` files
  - `.neon_local/` local proxy state and metadata

Never commit actual credentials, API keys, JWT secrets, or production connection strings to Git.

---

## 2. Environment Configuration Guide

### Local Development Setup

1. Copy the safe template:
   ```bash
   cp .env.example .env.development
   ```
2. Populate `.env.development` with your development credentials:
   - `DATABASE_URL`: Your local or development PostgreSQL/Neon connection string.
   - `JWT_SECRET`: A local random string for signing development session tokens.
   - `ARCJET_KEY`: Your development Arcjet license key.
   - If using Neon Local proxy: `NEON_API_KEY`, `NEON_PROJECT_ID`, `PARENT_BRANCH_ID`.
3. Never stage or commit `.env.development` to version control.

### Production Environment Setup

1. **No committed `.env.production` files:** Production secrets must NOT be stored in repository files or Docker images.
2. In production, configuration must be injected securely at runtime via:
   - Cloud Secret Managers (e.g., AWS Secrets Manager, GCP Secret Manager, Doppler, or HashiCorp Vault).
   - Container Task / Pod environment variable injection from secret stores.
3. Required production variables:
   - `DATABASE_URL`: Production PostgreSQL connection string with `sslmode=require`.
   - `JWT_SECRET`: Cryptographically strong 256-bit random string (never default or fallback).
   - `ARCJET_KEY`: Production Arcjet API key.
   - `CORS_ORIGIN`: Exact frontend URL (e.g., `https://app.example.com`).
   - `NODE_ENV=production`
   - `PORT=3000`
   - `LOG_LEVEL=info`

---

## 3. Required Credential Rotations (Security Remediation)

Due to historical repository exposure prior to the Phase 1.1 remediation, the following credentials must be treated as compromised and rotated in their respective external management consoles:

1. **Neon PostgreSQL Database Password:**
   - **Action Required:** In the Neon Console (console.neon.tech), navigate to Project Settings -> Database Users, reset/rotate the password for the active database user, and update all external systems.
2. **Neon Cloud API Key:**
   - **Action Required:** In the Neon Console -> Account Settings -> API Keys, revoke any `napi_...` key that was created prior to October 4, 2026, and generate a new key if needed.
3. **Arcjet Security API Key:**
   - **Action Required:** In the Arcjet Dashboard, revoke existing `ajkey_...` keys and issue new keys for development and production environments.
4. **JWT Signing Secret:**
   - **Action Required:** Generate a new, cryptographically secure 256-bit secret for production token signing. Ensure no instances use the historical placeholder values.

---

## 4. Code Quality & Security Gates (Phase 3.2)

To ensure code quality and prevent security regressions prior to CI/CD and deployment, all code must pass the local quality gate:

### Individual Commands

- **Lint Check:**
  ```bash
  npm run lint
  ```
- **Formatting Check:**
  ```bash
  npm run format:check
  ```
- **Automated Tests:**
  ```bash
  npm test
  ```
- **Test Coverage:**
  ```bash
  npm run test:coverage
  ```
- **Dependency Vulnerability Audit:**
  ```bash
  npm run audit:check
  # or standard npm audit:
  npm audit --audit-level=high
  ```
- **Container Build & Scan:**

  ```bash
  # Build production image
  npm run docker:build

  # Scan with Trivy (standalone or via container)
  trivy image --severity HIGH,CRITICAL acquisitions-app:latest
  # Or via Docker if Trivy is not installed locally:
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --severity HIGH,CRITICAL acquisitions-app:latest
  ```

### Combined Quality Gate

Run the full gate sequentially before committing:

```bash
npm run quality
```

The command enforces:

1. `npm run format:check` (Prettier)
2. `npm run lint` (ESLint)
3. `npm run test:coverage` (Jest & Supertest with coverage thresholds)
4. `npm run audit:check` (npm audit for HIGH/CRITICAL production vulnerabilities)

---

## 5. CI/CD Release Pipeline & Container Security (Phase 3.3)

A hardened GitHub Actions workflow (`.github/workflows/ci-cd.yml`) automates quality validation, container security analysis, and GHCR image publishing.

### Workflow Architecture & Triggers

- **Triggers:**
  - Pull Requests targeting `main` (runs validation and container scanning; publishing is strictly disabled).
  - Pushes to `main` (runs validation, container scanning, and conditional release to GHCR).
  - Manual triggers via `workflow_dispatch`.
- **Concurrency:** Automatically cancels in-flight duplicate PR workflows while allowing `main` release runs to complete cleanly.

### Required GitHub Secrets & Environment Variables

| Secret / Variable   | Scope                 | Purpose                                            | Safety Enforcement                                                              |
| :------------------ | :-------------------- | :------------------------------------------------- | :------------------------------------------------------------------------------ |
| `TEST_DATABASE_URL` | Repository Secret     | Dedicated connection string for automated CI tests | Must target a database containing `test` in name (never `neondb` or `postgres`) |
| `GITHUB_TOKEN`      | Built-in GitHub Token | GHCR authentication                                | Minimum scoped permissions (`contents: read`, `packages: write`)                |

> [!IMPORTANT]
> **Strict Secret Isolation:** Production `DATABASE_URL` is intentionally excluded from the CI quality/test job. The test runner only receives `TEST_DATABASE_URL`. If `TEST_DATABASE_URL` is unset or points to an unsafe database, test execution aborts immediately without attempting destructive cleanup.

### Database Safety Invariants in CI

1. `NODE_ENV=test` is explicitly set during quality gate execution.
2. `assertTestDatabase()` queries the live PostgreSQL server directly via `SELECT current_database()` and aborts with a fatal safety violation if the active database is `neondb`, `postgres`, or lacks a `test` identifier.
3. Test mocks in `tests/setup.js` automatically supply isolated test dummy values for `JWT_SECRET` and `ARCJET_KEY`. Production secrets are never injected into test environments.
4. No credentials or connection strings are ever logged or saved to build artifacts.

### Container Security & Trivy Release-Blocking Policy

1. **Hardened Multi-Stage Build:** The Dockerfile employs a dedicated `builder` stage that runs `npm ci --omit=dev` and prunes non-runtime migration and CLI tooling (`drizzle-kit`, `tsx`, `esbuild`). The `production` stage copies only runtime dependencies and application source files.
2. **Deterministic Security Scan:** Scans the exact production container using deterministic Trivy `0.75.0` (`aquasec/trivy:0.75.0`) for both vulnerabilities and exposed secrets:
   ```bash
   aquasec/trivy:0.75.0 image --scanners vuln,secret --severity HIGH,CRITICAL --skip-dirs /usr/local/lib/node_modules/npm --exit-code 1 <image>
   ```
3. **Fail-Closed Gate:** Zero tolerance for `HIGH` or `CRITICAL` findings. Any unresolved finding terminates the workflow and blocks release.
4. **Zero Active Suppressions (`.trivyignore`):** Because all non-runtime tooling is stripped during the Docker build stage, no application-level CVE suppressions are needed in `.trivyignore`.
5. **Tooling Directory Exclusion Rationale:** `/usr/local/lib/node_modules/npm` contains bundled npm CLI tooling from the upstream `node:22-alpine` base image. It is excluded from the scan because the production container executes only `node src/index.js` and does not use or expose npm CLI binaries at runtime.

### GHCR Publishing & Immutable Tagging Convention

Images are published to GitHub Container Registry at:

```text
ghcr.io/<github-owner>/aquisitions
```

Tags generated on each verified release to `main`:

- **Immutable Commit SHA:** `ghcr.io/<github-owner>/aquisitions:<full-commit-sha>` (Deterministic artifact reference for deployment).
- **Branch Tag:** `ghcr.io/<github-owner>/aquisitions:main` (Tracks the latest validated build on main).
- **Rolling Tag:** `ghcr.io/<github-owner>/aquisitions:latest` (Tracks the latest production-ready container).

Only the exact container image that passed the Trivy security scan is tagged and pushed to GHCR. Images are never rebuilt between security approval and publication.

### Production Migration Architecture & Contract

1. **Isolated Migration Runner (Pattern A):** The Dockerfile defines a dedicated `migration` stage (`target: migration`) that retains `drizzle-kit` and executes schema migrations via `npm run db:migrate`.
2. **Minimal Runtime Surface:** The final production runtime image (`target: production`) intentionally strips `drizzle-kit`, `tsx`, and `esbuild`, ensuring zero development-tooling CVEs exist in the production runtime container.
3. **Execution Ordering:** In Docker Compose (`docker-compose.prod.yml`), the `app` service depends on `migration` with `condition: service_completed_successfully`. Database migrations execute and complete before the runtime container starts.
4. **Phase 4 Deployment Reference:** The immutable commit SHA tag `ghcr.io/<github-owner>/aquisitions:<full-commit-sha>` published by the pipeline serves as the deployment source of truth.
