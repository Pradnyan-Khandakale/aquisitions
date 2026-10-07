# Multi-stage Dockerfile for Node.js acquisitions application

# Base image with Node.js LTS
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# Builder stage: installs production dependencies and strips non-runtime migration tooling
FROM base AS builder
RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI migration and build tooling (drizzle-kit, tsx, esbuild) from runtime dependencies
RUN rm -rf /app/node_modules/drizzle-kit /app/node_modules/tsx /app/node_modules/esbuild /app/node_modules/@esbuild* /app/node_modules/.bin/drizzle-kit /app/node_modules/.bin/tsx /app/node_modules/.bin/esbuild

# Migration stage: dedicated runner with migration tooling (drizzle-kit)
FROM base AS migration
USER root
RUN npm ci --omit=dev && npm cache clean --force
COPY src/ ./src/
COPY drizzle/ ./drizzle/
COPY drizzle.config.js ./
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
CMD ["npm", "run", "db:migrate"]

# Development stage: full dependencies for local development and migration execution
FROM base AS development
USER root
RUN npm ci && npm cache clean --force
COPY . .
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Production runtime stage: minimal Node runtime with production dependencies only
FROM node:22-alpine AS production
WORKDIR /app

# Copy production dependencies only from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY drizzle/ ./drizzle/
COPY drizzle.config.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3000

# Health check using lightweight liveness probe
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => { process.exit(1) })"

CMD ["node", "src/index.js"]