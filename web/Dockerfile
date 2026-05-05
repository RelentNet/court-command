# web/Dockerfile
# Multi-stage build for the Court Command web frontend
#
# Build args (all VITE_* are baked into the JS bundle at build time):
#   VITE_API_URL                       - Backend API URL (e.g. https://api.courtcommand.app)
#   VITE_GOOGLE_MAPS_API_KEY           - Google Maps API key (optional)
#   VITE_LOGTO_ENDPOINT                - Logto OIDC issuer (e.g. https://logto.courtcommand.app)
#   VITE_LOGTO_APP_ID                  - SPA app ID provisioned by logto-seed
#   VITE_LOGTO_API_RESOURCE            - API resource indicator (matches LOGTO_API_RESOURCE on backend)
#   VITE_AUTO_REDIRECT_SINGLE_SPORT    - When true, single-sport authenticated users skip the picker
#   VITE_WS_URL                        - WebSocket URL (e.g. wss://api.courtcommand.app/ws); leaves blank to derive from VITE_API_URL

FROM node:20-alpine AS builder

# Pin pnpm to match lockfile version
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Build args for Vite. ARG declarations make them available to RUN in
# this stage; the Vite build reads them via import.meta.env.VITE_*.
ARG VITE_API_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ARG VITE_LOGTO_API_RESOURCE
ARG VITE_AUTO_REDIRECT_SINGLE_SPORT
ARG VITE_WS_URL

# Promote build ARGs to ENV so Vite (which reads from process.env at
# build time, then strips VITE_-prefixed values into the bundle) can
# see them inside the RUN. Without this the ARG values are visible
# to shell expansion only, not to node processes.
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
ENV VITE_LOGTO_ENDPOINT=${VITE_LOGTO_ENDPOINT}
ENV VITE_LOGTO_APP_ID=${VITE_LOGTO_APP_ID}
ENV VITE_LOGTO_API_RESOURCE=${VITE_LOGTO_API_RESOURCE}
ENV VITE_AUTO_REDIRECT_SINGLE_SPORT=${VITE_AUTO_REDIRECT_SINGLE_SPORT}
ENV VITE_WS_URL=${VITE_WS_URL}

# Install dependencies with NODE_ENV=development to include devDeps
COPY package.json pnpm-lock.yaml ./
RUN NODE_ENV=development pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN NODE_ENV=production pnpm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
