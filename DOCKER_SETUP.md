# Docker Setup Guide for Acquisitions API

This guide explains how to run the Acquisitions API using Docker with different configurations for development and production environments.

## 🏗️ Architecture Overview

### Development Environment

- **Neon Local**: Runs a local proxy that creates ephemeral database branches
- **Application**: Connects to Neon Local proxy instead of cloud database
- **Benefits**: Fresh database for each session, no impact on production data

### Production Environment

- **Neon Cloud Database**: Direct connection to your production Neon database
- **Application**: Optimized production build with resource limits
- **Benefits**: Production-ready deployment with proper security and performance

## 📋 Prerequisites

1. **Docker & Docker Compose** installed on your system
2. **Neon Account** with a project created at [console.neon.tech](https://console.neon.tech)
3. **Neon API Key** (get from Neon Console → Account Settings → API Keys)

## 🔧 Initial Setup

### 1. Get Neon Credentials

From your [Neon Console](https://console.neon.tech):

- **NEON_API_KEY**: Go to Account Settings → API Keys
- **NEON_PROJECT_ID**: Found in Project Settings → General
- **DATABASE_URL**: Copy from your dashboard (for production)

### 2. Configure Environment Files

#### Development Configuration

Edit `.env.development`:

```bash
# Required for Neon Local
NEON_API_KEY=neon_api_1ABCDEFGHijklmnop1234567890
NEON_PROJECT_ID=steep-forest-12345678
PARENT_BRANCH_ID=main

# Application settings
JWT_SECRET=your-development-jwt-secret-key-here
PORT=3000
LOG_LEVEL=debug
```

#### Production Configuration

Edit `.env.production`:

```bash
# Direct Neon Cloud connection
DATABASE_URL=postgres://username:password@ep-cool-darkness-123456.us-east-2.aws.neon.tech/dbname?sslmode=require

# Application settings
JWT_SECRET=your-strong-production-jwt-secret-key-here
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=https://yourdomain.com
```

## 🚀 Development Workflow

### Starting Development Environment

```bash
# Start with Neon Local (creates fresh ephemeral database)
npm run docker:dev

# Or manually
docker compose -f docker-compose.dev.yml --env-file .env.development up --build
```

This will:

1. Start Neon Local proxy on port 5432
2. Create an ephemeral database branch from your main branch
3. Start your application with hot-reload on port 3000
4. Mount your source code for live development

### Development Commands

```bash
# View logs
docker compose -f docker-compose.dev.yml logs -f app

# Stop and remove containers + volumes
docker compose -f docker-compose.dev.yml down -v

# Rebuild containers
docker compose -f docker-compose.dev.yml build

# Run database migrations (inside running container)
docker compose -f docker-compose.dev.yml exec app npm run db:migrate

# Open Drizzle Studio (inside running container)
docker compose -f docker-compose.dev.yml exec app npm run db:studio
```

### Development Features

- **Hot Reload**: Code changes automatically restart the server
- **Fresh Database**: Each `docker:dev` creates a new database branch
- **Volume Mounts**: Source code is mounted for live development
- **Debug Logging**: Verbose logging for development

## 🏭 Production Deployment

### Starting Production Environment

```bash
# Start in production mode (builds, migrates via migration container, starts app detached)
./scripts/prod.sh

# Or manually
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migration
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

This will:

1. Build optimized production image (Node 22 LTS, non-root user `nodejs`, runtime dependencies only)
2. Run database migrations inside an ephemeral `migration` container task (providing `drizzle-kit` in an isolated stage)
3. Connect directly to your Neon Cloud database
4. Run with resource limits, structured JSON stdout logging, and health checks
5. Start in detached mode

### Production Commands

```bash
# View logs (structured JSON from stdout/stderr)
docker logs -f acquisitions-app-prod

# Stop production container (initiates graceful shutdown via SIGTERM)
docker compose -f docker-compose.prod.yml down

# Rebuild production image
docker compose -f docker-compose.prod.yml build
```

### Production Features

- **Optimized Build**: Multi-stage Docker build with Node 22 LTS
- **Resource Limits**: CPU and memory constraints
- **Health Checks**: Built-in `/health/live` liveness and `/health/ready` database readiness probes
- **Structured Logging**: JSON logging directly to stdout/stderr for Docker logging drivers
- **Graceful Shutdown**: Intercepts SIGTERM/SIGINT, closes HTTP listeners, and drains connections
- **Security**: Non-root user (UID 1001), hardened trust proxy, Arcjet security headers

## 🔍 Database Management

### Running Migrations

#### Development

```bash
# Inside running dev container
docker compose -f docker-compose.dev.yml exec app npm run db:migrate

# Or connect to Neon Local directly
docker compose -f docker-compose.dev.yml exec neon-local psql -U neon -d neondb
```

#### Production

```bash
# Dedicated migration container (Pattern A - uses isolated migration stage with drizzle-kit)
docker compose -f docker-compose.prod.yml run --rm migration
```

> [!NOTE]
> The production runtime image (`target: production`) intentionally strips `drizzle-kit`, `tsx`, and `esbuild` to keep the runtime container minimal and eliminate non-runtime CVEs. Production migrations are executed via the dedicated `migration` container runner (`target: migration`) before application startup.

### Database Studio

```bash
# Development (with Neon Local)
docker exec acquisitions-app-dev npm run db:studio
# Visit http://localhost:4983

# Production (connects to cloud)
docker exec acquisitions-app-prod npm run db:studio
```

## 🌐 Network Configuration

### Development

- **Application**: http://localhost:3000
- **Neon Local**: localhost:5432
- **Drizzle Studio**: http://localhost:4983

### Production

- **Application**: http://localhost:3000 (configure reverse proxy)
- **Database**: Direct connection to Neon Cloud

## 🔒 Security Considerations

### Development

- Ephemeral databases automatically deleted
- Debug logging may expose sensitive information
- Use only for development

### Production

- Strong JWT secrets
- CORS properly configured
- Resource limits enforced
- Health checks for reliability

## 🐛 Troubleshooting

### Common Issues

#### "Cannot connect to Neon Local"

```bash
# Check if Neon Local is healthy
docker compose -f docker-compose.dev.yml ps

# Check Neon Local logs
docker logs acquisitions-neon-local

# Verify environment variables
docker compose -f docker-compose.dev.yml config
```

#### "Database migration failed"

```bash
# Check database connection
docker compose -f docker-compose.dev.yml exec app npm run db:studio

# Run migrations inside container
docker compose -f docker-compose.dev.yml exec app npm run db:migrate
```

#### "Port already in use"

```bash
# Stop all containers
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.prod.yml down

# Check what's using the port
netstat -ano | findstr :3000
```

### Cleanup Commands

```bash
# Remove all containers and volumes
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.prod.yml down -v

# Remove Docker images
docker rmi acquisitions-app
```

## 📁 File Structure

```
acquisitions/
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # GitHub Actions CI/CD release pipeline
├── Dockerfile                 # Multi-stage Docker build (Node 22 LTS, non-root)
├── docker-compose.dev.yml     # Development with Neon Local & hot reload
├── docker-compose.prod.yml    # Production with Neon Cloud & resource limits
├── .dockerignore              # Files excluded from build
├── .trivyignore               # Trivy vulnerability suppression policy
├── .env.development           # Development environment vars (git ignored)
├── .env.production            # Production environment vars (git ignored)
└── .neon_local/               # Neon Local metadata (git ignored)
```

## 📦 Container Registry & CI/CD Release (Phase 3.3)

Production images are automatically built, security scanned with Trivy, and published to GitHub Container Registry (GHCR) on pushes to `main`. The release workflow publishes both exact images corresponding to the same Git commit SHA:

### Registry Images

1. **Application Runtime Image:**

   ```text
   ghcr.io/<github-owner>/aquisitions:<commit-sha>
   ```

   - Minimal Node.js 22 LTS runtime.
   - Development and migration tooling (`drizzle-kit`, `tsx`, `esbuild`) stripped to ensure zero runtime CVEs.

2. **Database Migration Image:**

   ```text
   ghcr.io/<github-owner>/aquisitions-migration:<commit-sha>
   ```

   - Dedicated migration runner container (`target: migration`).
   - Retains `drizzle-kit` and schema migrations solely for pre-deployment database migration Jobs.

### Image Tagging Conventions

Every approved release publishes three tags for each image:

1. **Immutable Commit SHA:** `...:<full-commit-sha>`
   - Provides an exact, immutable reference for subsequent deployments (e.g., Kubernetes in Phase 4). Both app and migration images share the exact same commit SHA.
2. **Branch Reference:** `...:main`
   - Points to the latest validated release built from the `main` branch.
3. **Rolling Tag:** `...:latest`
   - Points to the most recent release.

### Pulling and Running an Immutable Image

```bash
# Pull by exact commit SHA
docker pull ghcr.io/<github-owner>/aquisitions:<commit-sha>
docker pull ghcr.io/<github-owner>/aquisitions-migration:<commit-sha>

# Run migration container
docker run --rm \
  --env-file .env.production \
  ghcr.io/<github-owner>/aquisitions-migration:<commit-sha>

# Run production application container
docker run -d \
  -p 3000:3000 \
  --name acquisitions-app-prod \
  --env-file .env.production \
  ghcr.io/<github-owner>/aquisitions:<commit-sha>
```

### Deploying to Kubernetes (Phase 4.1)

For Kubernetes deployments (namespace, secrets, migration job, deployment, service, ingress, and Minikube validation), refer to the comprehensive [Kubernetes Setup Guide](file:///c:/Users/91932/OneDrive/Desktop/Production-Ready API/aquisitions/K8S_SETUP.md).

### CI/CD Security Gating

- Pull Requests run the complete test suite, coverage thresholds, dependency audit, Docker build, and Trivy scan, but cannot push to GHCR.
- Release to GHCR executes only after all quality checks and the Trivy container scan pass with zero unsuppressed HIGH or CRITICAL findings.

## 🎯 Best Practices

1. **Always use environment-specific files**
2. **Never commit real credentials to git**
3. **Use ephemeral branches for development testing**
4. **Monitor resource usage in production**
5. **Regularly update Docker images**
6. **Use Docker health checks**
7. **Implement proper logging and monitoring**

## 🚀 Quick Start Checklist

- [ ] Install Docker and Docker Compose
- [ ] Create Neon account and get API credentials
- [ ] Update `.env.development` with your Neon credentials
- [ ] Update `.env.production` with your production database URL
- [ ] Run `npm run docker:dev` to start development
- [ ] Visit http://localhost:3000 to verify the application
- [ ] Run database migrations if needed
- [ ] For production, use `npm run docker:prod`

---

For additional help, check the [Neon Local documentation](https://neon.com/docs/local/neon-local) or create an issue in the project repository.
