#!/bin/bash

# Development startup script for Acquisition App with Neon Local
# This script starts the application in development mode with Neon Local

echo "🚀 Starting Acquisition App in Development Mode"
echo "================================================"

# Check if .env.development exists
if [ ! -f .env.development ]; then
    echo "❌ Error: .env.development file not found!"
    echo "   Please copy .env.development from the template and update with your Neon credentials."
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "   Please start Docker Desktop and try again."
    exit 1
fi

# Create .neon_local directory if it doesn't exist
mkdir -p .neon_local

# Add .neon_local to .gitignore if not already present
if ! grep -q ".neon_local/" .gitignore 2>/dev/null; then
    echo ".neon_local/" >> .gitignore
    echo "✅ Added .neon_local/ to .gitignore"
fi

echo "📦 Building and starting development containers..."
echo "   - Neon Local proxy will create an ephemeral database branch"
echo "   - Application will run with hot reload enabled"
echo ""

# Start development environment (detached so we can run migrations inside the container)
echo "📦 Starting containers (detached) and building images..."
docker compose -f docker-compose.dev.yml up --build -d

# Wait for the database to be ready
echo "⏳ Waiting for the database to be ready..."
# Poll the Neon Local container until psql returns successfully
until docker compose exec neon-local pg_isready -h localhost -p 5432 -U neon >/dev/null 2>&1; do
    printf '.'
    sleep 1
done
echo "\n✅ Database is ready"

# Run migrations with Drizzle inside the app container (avoids calling host npm from sh/bash)
echo "📜 Applying latest schema with Drizzle inside the app container..."
docker compose exec app npm run db:migrate

# Attach to the app logs in the foreground for developer feedback
echo "📢 Attaching to app logs (press Ctrl+C to detach)"
docker compose logs -f app

echo ""
echo "🎉 Development environment started!"
echo "   Application: http://localhost:3000"
echo "   Database: postgres://neon:npg@localhost:5432/neondb"
echo ""
echo "To stop the environment, press Ctrl+C or run: docker compose down"