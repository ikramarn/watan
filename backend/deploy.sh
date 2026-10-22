#!/bin/bash
set -e

echo "🚀 Starting Watan Production Deployment (وطن)..."

# 1. Ensure Docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  usermod -aG docker $USER
fi

# 2. Build Control Room static bundle
echo "📦 Building Control Room Admin Panel..."
cd ../control_room
if ! [ -x "$(command -v node)" ]; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install
npm run build
cd ../backend

# 3. Launch Docker Compose Stack (API, Redis, Caddy)
echo "⚡ Starting Docker Containers (FastAPI + Redis + Caddy SSL)..."
docker compose -f docker-compose.prod.yml down --remove-orphans || true
docker compose -f docker-compose.prod.yml build --no-cache api
docker compose -f docker-compose.prod.yml up -d

echo "✅ Watan Production Stack is LIVE!"
echo "👉 API & WebSockets: http://localhost:8000"
echo "👉 Health check: http://localhost:8000/docs"
