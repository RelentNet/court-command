// api/middleware/mirror_user.go
//
// MirrorUser is the on-demand sync path that complements the
// LogtoWebhookHandler (eventual sync). When a JWT-authenticated
// request reaches a /me/* route and no local users row exists for
// the JWT subject, MirrorUser fetches the user from Logto's
// Management API and inserts the mirror row before continuing.
//
// This eliminates the gap between webhook delay and the very first
// authenticated request after sign-up: the user can sign up in Logto,
// be redirected straight to /pickleball/profile, and have a working
// profile-edit experience without waiting for the webhook to land.
//
// Must be chained AFTER RequireJWT so auth.ClaimsFromContext is
// populated. Without claims it short-circuits (next.ServeHTTP) so
// public routes that happen to share a router group aren't blocked.
//
// The dependencies are accepted as small interfaces (see below)
// rather than concrete types: this lets tests substitute hand-rolled
// fakes without spinning up Postgres or an httptest Logto server.
package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/service"
	"github.com/jackc/pgx/v5"
)

// LogtoUserFetcher is the slice of *logto.Client this middleware
// actually consumes. *logto.Client satisfies it; tests stub it with
// a struct returning canned responses.
type LogtoUserFetcher interface {
	GetUser(ctx context.Context, userID string) (*logto.LogtoUser, error)
}

// UserMirrorQueries is the slice of *generated.Queries this middleware
// uses. *generated.Queries satisfies it; tests stub it.
type UserMirrorQueries interface {
	GetUserByLogtoUserID(ctx context.Context, logtoUserID *string) (generated.User, error)
}

// UserSyncer is the slice of *service.UserSyncService this middleware
// calls when no local row exists yet. *service.UserSyncService
// satisfies it; tests stub it.
type UserSyncer interface {
	UpsertFromLogto(ctx context.Context, in service.LogtoUserUpsert) error
}

// MirrorUser ensures a local users row exists for the JWT subject on
// every request that flows through it. It MUST be chained AFTER
// RequireJWT.
//
// Behavior:
//   - No claims on context             => pass through (defensive; the
//     enclosing group should always set claims, but we don't 500 if
//     this middleware is mounted on a public route by accident)
//   - Local row found                  => pass through
//   - DB lookup error (non-NoRows)     => 500 internal_error
//   - No local row, fetch from Logto:
//       - Logto error                  => 503 logto_unreachable
//       - upsert error                 => 500 internal_error
//       - upsert ok                    => pass through
func MirrorUser(client LogtoUserFetcher, queries UserMirrorQueries, userSync UserSyncer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.ClaimsFromContext(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			sub := claims.Subject
			_, err := queries.GetUserByLogtoUserID(r.Context(), &sub)
			if err == nil {
				next.ServeHTTP(w, r)
				return
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				writeError(w, http.StatusInternalServerError, "internal_error", "user lookup failed")
				return
			}
			// Fetch from Logto and upsert.
			lu, err := client.GetUser(r.Context(), claims.Subject)
			if err != nil {
				writeError(w, http.StatusServiceUnavailable, "logto_unreachable", "cannot fetch user")
				return
			}
			first, last := splitName(lu.Name)
			if err := userSync.UpsertFromLogto(r.Context(), service.LogtoUserUpsert{
				LogtoUserID: lu.ID,
				Email:       lu.PrimaryEmail,
				FirstName:   first,
				LastName:    last,
				DisplayName: lu.Name,
			}); err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "mirror failed")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// splitName is duplicated from handler.splitName -- middleware can't
// import handler without a cycle, and these are tiny enough that
// extracting to a third package isn't worth it. Keep the two impls
// identical; if you change behavior here, update handler too.
func splitName(full string) (first, last string) {
	parts := strings.SplitN(strings.TrimSpace(full), " ", 2)
	if len(parts) == 0 || parts[0] == "" {
		return "", ""
	}
	first = parts[0]
	if len(parts) > 1 {
		last = parts[1]
	}
	return
}
