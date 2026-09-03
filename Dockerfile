# ── Stage 1: Build Frontend (Vite React) ───────────────────────────
FROM node:20-slim AS web-builder
WORKDIR /app

# Copy workspace package manifests
COPY pnap-mis/package.json pnap-mis/package-lock.json ./
COPY pnap-mis/server/package.json ./server/
COPY pnap-mis/web/package.json ./web/

# Install dependencies required for frontend build
RUN npm ci --workspace=web --include-workspace-root

# Copy web source files
COPY pnap-mis/web ./web

# Build static SPA assets into web/dist
RUN npm run build --workspace=web

# ── Stage 2: Production Server Runner ─────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy workspace package manifests
COPY pnap-mis/package.json pnap-mis/package-lock.json ./
COPY pnap-mis/server/package.json ./server/
COPY pnap-mis/web/package.json ./web/

# Install production dependencies for server workspace
RUN npm ci --omit=dev --workspace=server --include-workspace-root

# Copy backend source code
COPY pnap-mis/server ./server

# Copy compiled frontend assets from builder stage
COPY --from=web-builder /app/web/dist ./web/dist

# Create writable upload and export directories and grant ownership to node user
RUN mkdir -p /app/uploads /app/server/uploads /app/server/exports && \
    chown -R node:node /app/uploads /app/server/uploads /app/server/exports

# Switch to non-root node user for container security
USER node

# Render dynamically assigns PORT at runtime (defaults to 10000 on Render, 5000 locally)
EXPOSE 5000 10000

# Platform Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const http = require('http'); const port = process.env.PORT || 5000; http.get('http://127.0.0.1:' + port + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start Express server (serves both API and SPA frontend)
CMD ["node", "server/src/index.js"]
