# Multi-stage single image (ADR-0004): stage 1 builds the Vite bundle,
# stage 2 is a slim Node runtime serving /api + the static build.
# Node is pinned to a patched release (>= 22.23.4, Node.js Oct 2026 security
# release incl. CVE-2026-111497). Bump deliberately; rebuild with --pull.
FROM node:22.23.4-alpine AS client-build
WORKDIR /build
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22.23.4-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-build /build/dist ./client/dist
EXPOSE 8080
# App Service: set WEBSITES_PORT=8080 on the Web App (atlas §3.3)
CMD ["node", "server/index.js"]
