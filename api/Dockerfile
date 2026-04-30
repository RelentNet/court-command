# api/Dockerfile
# Multi-stage build for the Court Command API

# --- Stage 1: Build ---
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

# Allow toolchain auto-download for newer Go versions
ENV GOTOOLCHAIN=auto

WORKDIR /app

# Copy dependency files first (layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary, injecting the git commit and build timestamp into the
# binary so /api/v1/health can report which build is live.
#
# Commit comes from the COMMIT build arg (passed by docker-compose) which
# in Coolify is wired to the SOURCE_COMMIT env, or from
# COOLIFY_GIT_COMMIT_SHA at build time, or as a last resort "unknown".
# The build context is ./api (not the repo root) so git is unavailable
# here -- ARG/ENV is the only mechanism that works.
ARG COMMIT
ARG COOLIFY_GIT_COMMIT_SHA
RUN RESOLVED_COMMIT="${COMMIT:-${COOLIFY_GIT_COMMIT_SHA:-unknown}}" \
 && BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
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
