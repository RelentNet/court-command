// api/middleware/optional_jwt.go
//
// OptionalJWT is the JWT counterpart to OptionalAuth. It validates the
// Authorization Bearer token if one is present and populates session.Data
// (via the same bridge logic as JWTSession), but never rejects an
// unauthenticated request.
//
// Use case: mixed-auth route groups where reads are public but writes
// (handler-level) check `session.SessionData(r.Context())` and 401 on
// nil. Pre-Phase-3 these routes worked because OptionalAuth populated
// session.Data from the cookie. After Phase 3 the SPA stopped sending
// cookies; without OptionalJWT the same handlers silently 401 every
// authenticated write.
//
// Mount globally alongside OptionalAuth -- the two cooperate: cookie
// path runs first, then JWT path. If either populates session.Data,
// the handler sees it. If neither does, the handler's nil check fires
// 401 (correct behavior).
//
// Differences from RequireJWT:
//   - No Authorization header: pass through, no error.
//   - Invalid token (signature, expiry, audience): pass through, no error.
//     The route may be reachable anonymously; let the handler's auth
//     check decide.
//   - Logto Mgmt API unreachable on cold-cache lookup: pass through.
//     We can't authenticate, but we shouldn't 503 a request that might
//     have been anonymous anyway.
//
// Differences from JWTSession:
//   - Permissive (passes through) on every error path.
//   - Does NOT call writeError; never short-circuits the chain.

package middleware

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
	"github.com/jackc/pgx/v5"
)

// OptionalJWT returns a middleware that populates session.Data from a
// valid JWT if present. Pass-through on every failure path so anonymous
// requests survive.
//
// Args mirror JWTSession (validator + Logto client + queries + userSync)
// because the populate path is identical to the bridge.
func OptionalJWT(
	validator *auth.Validator,
	client LogtoUserFetcher,
	queries JWTSessionQueries,
	userSync UserSyncer,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Already populated by an earlier middleware? Skip; never
			// override session data set by OptionalAuth.
			if session.SessionData(r.Context()) != nil {
				next.ServeHTTP(w, r)
				return
			}

			token, ok := bearerToken(r.Header.Get("Authorization"))
			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			// orgScoped=true: the SPA sends org-scoped tokens; this matches
			// the validator config used everywhere else in the app.
			claims, err := validator.Validate(r.Context(), token, true)
			if err != nil {
				// JWKS unavailable is an infrastructure failure -- the
				// auth provider is down. We still pass through (the
				// permissive contract), but log at ERROR so operators
				// see the signal during an outage. Without this branch,
				// every authenticated mixed-auth write silently 401s
				// (handler-level guard fires) and the only logs are
				// debug-level "validate failed" messages typically
				// filtered out at LevelInfo.
				if errors.Is(err, auth.ErrJWKSUnavailable) {
					slog.ErrorContext(r.Context(),
						"optional-jwt jwks unavailable; mixed-auth writes will 401 until Logto recovers",
						"err", err)
				} else {
					// Routine probes (expired, bad sig, wrong aud)
					// log at debug -- they're spammy and not actionable.
					slog.DebugContext(r.Context(), "optional-jwt validate failed", "err", err)
				}
				next.ServeHTTP(w, r)
				return
			}

			// Mirror the JWTSession lookup-then-fetch+upsert path, but
			// permissive: any failure -> pass through unauthenticated
			// rather than short-circuit.
			sub := claims.Subject
			user, err := queries.GetUserByLogtoUserID(r.Context(), &sub)
			if err != nil {
				if !errors.Is(err, pgx.ErrNoRows) {
					slog.WarnContext(r.Context(), "optional-jwt user lookup failed", "err", err)
					next.ServeHTTP(w, r)
					return
				}
				// No local row: try to mirror on-demand. Failure is
				// tolerable (next.ServeHTTP without session.Data; handler's
				// nil check will 401 if the route is auth-required).
				lu, err := client.GetUser(r.Context(), sub)
				if err != nil {
					slog.WarnContext(r.Context(), "optional-jwt logto fetch failed", "err", err)
					next.ServeHTTP(w, r)
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
					slog.WarnContext(r.Context(), "optional-jwt upsert failed", "err", err)
					next.ServeHTTP(w, r)
					return
				}
				user, err = queries.GetUserByLogtoUserID(r.Context(), &sub)
				if err != nil {
					slog.WarnContext(r.Context(), "optional-jwt post-upsert lookup failed", "err", err)
					next.ServeHTTP(w, r)
					return
				}
			}

			data := userToSessionData(&user)
			// Phase 3.6 review C2 fix: derive role from JWT claims so admin
			// privileges flow through. The bridge's userToSessionData uses
			// the local users.role column which defaults to 'player' for
			// freshly-mirrored users; we override here when claims show an
			// elevated org role.
			if elevated := elevatedRoleFromClaims(claims); elevated != "" && elevated != data.Role {
				data.Role = elevated
			}
			ctx := session.SetSessionData(r.Context(), data)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
