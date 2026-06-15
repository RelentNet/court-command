// api/middleware/jwt_session.go
//
// JWTSession is the Phase 3.5 bridge middleware. It validates the
// Logto JWT (must run AFTER RequireJWT), ensures a local users mirror
// row exists (same on-demand fetch+upsert pattern as MirrorUser),
// looks up the local row, and pushes a *session.Data into the request
// context.
//
// The 18 authenticated route groups in router.go that pre-Phase-3
// used RequireAuth(SessionStore) read session.SessionData(r.Context())
// in their handlers (149 call sites across handler/ and service/).
// JWTSession populates the same context value, so existing handlers
// don't need to change. Phase 6 cutover will swap reads to
// auth.ClaimsFromContext + a typed user lookup; until then the
// session.Data shape is the lingua franca.
//
// Mount order:
//
//   r.Use(middleware.RequireJWT(validator, true))
//   r.Use(middleware.JWTSession(logtoClient, queries, userSync, orgRoles))
//
// session.Data fields populated:
//   - UserID:    local users.id (int64)
//   - Email:     users.email (deref *string; "" if NULL in DB)
//   - Role:      users.role
//   - PublicID:  users.public_id
//   - CreatedAt: users.created_at unix seconds
//
// session.Data.Impersonator* fields are NOT populated -- JWT has no
// impersonation concept yet. Phase 6 will need a Logto-native
// impersonation story or drop the feature.
package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
	"github.com/jackc/pgx/v5"
)

// JWTSessionQueries is the query surface JWTSession depends on.
// *generated.Queries satisfies it; tests stub it.
type JWTSessionQueries interface {
	GetUserByLogtoUserID(ctx context.Context, logtoUserID *string) (generated.User, error)
}

// JWTSession returns a middleware that bridges JWT-authenticated
// requests to the legacy session.Data context. Must be chained AFTER
// RequireJWT.
//
// If the local users mirror is missing, the middleware fetches the
// user from Logto's Management API and inserts it via UserSyncer
// before continuing -- same on-demand pattern as MirrorUser. After
// the upsert it re-reads the row to pick up the assigned local
// users.id.
//
// Role elevation has two paths, tried in order:
//
//  1. JWT fast path: claims.ElevatedRole() reads the JWT's
//     organization_roles claim. This is the original design but Logto
//     does NOT actually populate that claim in API-resource access
//     tokens (it only ships in ID tokens and userinfo per Logto's
//     design). Kept here so we benefit automatically if Logto ever
//     adds the claim, or if a JWT customizer is configured to inject
//     it.
//
//  2. Management API path: if the fast path returned nothing AND the
//     token has an organization_id, ask the Logto Management API for
//     the user's roles in that org via OrgRoleResolver. The resolver
//     caches in Redis with a configurable TTL so the per-request
//     overhead is dominated by cache hits.
//
// orgRoles can be nil -- in that case only the JWT fast path runs.
// Used by tests that don't want to wire a resolver fake, and by
// development environments without Logto Management API creds.
func JWTSession(
	client LogtoUserFetcher,
	queries JWTSessionQueries,
	userSync UserSyncer,
	orgRoles OrgRoleResolver,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.ClaimsFromContext(r.Context())
			if !ok {
				// RequireJWT didn't run, OR the route is misconfigured.
				// Programmer error: surface as 500 so it's loud in dev.
				writeError(w, http.StatusInternalServerError, "internal_error", "missing claims")
				return
			}

			sub := claims.Subject
			user, err := queries.GetUserByLogtoUserID(r.Context(), &sub)
			if err != nil {
				if !errors.Is(err, pgx.ErrNoRows) {
					writeError(w, http.StatusInternalServerError, "internal_error", "user lookup failed")
					return
				}
				// No local row: fetch from Logto and upsert.
				lu, err := client.GetUser(r.Context(), sub)
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
				// Re-read to get the assigned id.
				user, err = queries.GetUserByLogtoUserID(r.Context(), &sub)
				if err != nil {
					writeError(w, http.StatusInternalServerError, "internal_error", "post-mirror lookup failed")
					return
				}
			}

			data := userToSessionData(&user)

			// Path 1: JWT fast path. Free if it works; no-op otherwise.
			if elevated := claims.ElevatedRole(); elevated != "" && elevated != data.Role {
				data.Role = elevated
			}

			// Path 2: Management API path. Only when:
			//   - We didn't already elevate via the JWT fast path
			//   - The token carries an organization_id (otherwise we
			//     don't know which org's roles to look up)
			//   - The local DB role isn't already platform_admin
			//     (no point upgrading a user who's already at the top)
			//   - We have a resolver wired (production has one; some
			//     tests pass nil to skip this path)
			if orgRoles != nil &&
				data.Role != "platform_admin" &&
				claims.OrganizationID != "" {
				roles, lookupErr := orgRoles.GetUserOrganizationRoles(
					r.Context(), claims.OrganizationID, sub)
				if lookupErr != nil {
					// Don't fail the request -- the user may legitimately
					// be a non-admin and we shouldn't deny them just
					// because Logto's Mgmt API hiccuped. Log so ops can
					// see degraded elevation behavior.
					slog.Warn("logto org-role lookup failed; falling back to local DB role",
						"user_id", sub,
						"org_id", claims.OrganizationID,
						"error", lookupErr)
				} else if containsRole(roles, "platform_admin") {
					data.Role = "platform_admin"
				}
				// Other role names (tournament_director, etc.) are
				// gated per-tournament via tournament_staff, NOT via
				// users.role. Matches the spec from
				// api/auth/context.go:ElevatedRole.
			}

			ctx := session.SetSessionData(r.Context(), data)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// userToSessionData translates a Phase-2-plus generated.User row into
// the legacy session.Data shape that 149 handler call sites still
// read via session.SessionData(ctx).
func userToSessionData(u *generated.User) *session.Data {
	d := &session.Data{
		UserID:   u.ID,
		Role:     u.Role,
		PublicID: u.PublicID,
	}
	if u.Email != nil {
		d.Email = *u.Email
	}
	if !u.CreatedAt.IsZero() {
		d.CreatedAt = u.CreatedAt.Unix()
	}
	return d
}

// (Role-elevation logic moved to auth.Claims.ElevatedRole() so handlers
// like AuthHandler.MeJWT can apply the same mapping when returning the
// /api/v1/auth/me payload to the SPA.)
