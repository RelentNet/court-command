# api/Dockerfile
# Multi-stage build for the Court Command API.

# --- Stage 1: Build ---
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

# Allow toolchain auto-download for newer Go versions
ENV GOTOOLCHAIN=auto

WORKDIR /app

# Copy dependency files first (layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy source code (build context is ./api)
COPY . .

# Build the binary, injecting the build timestamp into the binary so
# /api/v1/health can report when the deployed image was built. The
# commit SHA falls back to "unknown" because Coolify (this version)
# does not expose SOURCE_COMMIT or COOLIFY_GIT_COMMIT_SHA at docker
# build time. The built_at timestamp alone is sufficient to verify a
# fresh deploy landed; pairing it with the local 'git log' tells you
# the exact commit by time.
#
# If a future Coolify version surfaces the SHA at build time, set
# COMMIT in docker-compose.yaml's build.args and the SHA will appear
# in the health response automatically.
ARG COMMIT
RUN RESOLVED_COMMIT="${COMMIT:-unknown}" \
 && BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
 && echo "Building court-command commit=${RESOLVED_COMMIT} built_at=${BUILT_AT}" \
 && CGO_ENABLED=0 GOOS=linux go build \
      -ldflags="-s -w \
        -X github.com/court-command/court-command/handler.buildCommit=${RESOLVED_COMMIT} \
        -X github.com/court-command/court-command/handler.buildBuiltAt=${BUILT_AT}" \
      -o /court-command .

# --- Stage 2: Run ---
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy binary from builder
COPY --from=builder /court-command .

# Copy migrations (embedded in binary via go:embed, but also available for manual goose runs)
COPY --from=builder /app/db/migrations ./db/migrations


# Create uploads directory
RUN mkdir -p uploads && chown appuser:appgroup uploads

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/v1/health || exit 1

CMD ["./court-command"]
