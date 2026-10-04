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
