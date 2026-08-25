# ── Stage 1: Build Frontend (Vite React) ───────────────────────────
FROM node:20-slim AS web-builder
WORKDIR /app

# Copy workspace package manifests
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

# Install dependencies required for frontend build
RUN npm ci --workspace=web --include-workspace-root

# Copy web source files
COPY web ./web

# Build static SPA assets into web/dist
RUN npm run build --workspace=web

# ── Stage 2: Production Server Runner ─────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy workspace package manifests
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

# Install production dependencies for server workspace
RUN npm ci --omit=dev --workspace=server --include-workspace-root

# Copy backend source code
COPY server ./server

# Copy compiled frontend assets from builder stage
COPY --from=web-builder /app/web/dist ./web/dist

# Create writable upload and export directories and grant ownership to node user
RUN mkdir -p /app/server/uploads /app/server/exports && \
    chown -R node:node /app/server/uploads /app/server/exports

# Switch to non-root node user for container security
USER node

# Railway assigns PORT dynamically at runtime
EXPOSE 5000

# Start Express server (serves both API and SPA frontend)
CMD ["node", "server/src/index.js"]
