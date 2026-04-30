// api/handler/health.go
package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// buildCommit and buildBuiltAt are injected at link time via -ldflags so
// /api/v1/health can report which build is live. Defaults are used during
// `go run` and tests where the linker flags aren't applied.
//
// See api/Dockerfile for the production build invocation.
//
//nolint:gochecknoglobals // build-time constants
var (
	buildCommit  = "dev"
	buildBuiltAt = "unknown"
)

// HealthHandler checks the health of backend services.
type HealthHandler struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(db *pgxpool.Pool, redis *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, redis: redis}
}

// Check handles GET /api/v1/health.
func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	status := "ok"
	dbStatus := "ok"
	redisStatus := "ok"

	if err := h.db.Ping(ctx); err != nil {
		dbStatus = "error"
		status = "degraded"
	}

	if err := h.redis.Ping(ctx).Err(); err != nil {
		redisStatus = "error"
		status = "degraded"
	}

	statusCode := http.StatusOK
	if status != "ok" {
		statusCode = http.StatusServiceUnavailable
	}

	JSON(w, statusCode, map[string]interface{}{
		"status": status,
		"services": map[string]string{
			"database": dbStatus,
			"redis":    redisStatus,
		},
		"build": map[string]string{
			"commit":   buildCommit,
			"built_at": buildBuiltAt,
		},
	})
}
