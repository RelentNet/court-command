# api/Dockerfile
# Multi-stage build for the Court Command API.
#
# Build context is the REPO ROOT (docker-compose.yaml sets context: ".")
# so the build can read .git for commit-SHA injection. Coolify clones the
# repo with --depth=1 so .git is a real directory at the context root.

# --- Stage 1: Build ---
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

# Allow toolchain auto-download for newer Go versions
ENV GOTOOLCHAIN=auto

WORKDIR /app

# Copy dependency files first (layer caching)
COPY api/go.mod api/go.sum ./
RUN go mod download

# Copy api source
COPY api/ ./

# Copy .git into a sibling directory (not /app/.git which would confuse
# the go build with embedded version info). This is best-effort: if .git
# is absent or unusual (e.g. a worktree pointer file in local dev),
# git rev-parse fails and we fall back to "unknown".
COPY .git/ /tmp/repo/.git/

# Build the binary, injecting the git commit and build timestamp into
# the binary so /api/v1/health can report which build is live.
#
# Resolution order:
#   1. COMMIT build arg (Coolify SOURCE_COMMIT or any explicit pass)
#   2. git rev-parse against /tmp/repo (Coolify-cloned .git)
#   3. "unknown"
ARG COMMIT
RUN RESOLVED_COMMIT="${COMMIT:-$(git -C /tmp/repo rev-parse --short HEAD 2>/dev/null || echo unknown)}" \
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
