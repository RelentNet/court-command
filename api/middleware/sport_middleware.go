// api/middleware/sport_middleware.go
package middleware

import (
	"log/slog"
	"net/http"

	"github.com/court-command/court-command/auth"
)

// SportResolver maps sport slugs (e.g. "pickleball") to Logto organization
// IDs (e.g. "ekup1zyrrxj4"). Populated at app startup from environment
// variables LOGTO_PICKLEBALL_ORG_ID and LOGTO_DEMO_SPORT_ORG_ID. The
// resolver is read-only after construction and safe for concurrent use.
type SportResolver struct {
	slugToOrgID map[string]string
}

// NewSportResolver builds a resolver from a slug-to-orgID map. The input
// map is copied; later mutation of the caller's map does not affect the
// resolver.
func NewSportResolver(slugToOrgID map[string]string) *SportResolver {
	m := make(map[string]string, len(slugToOrgID))
	for k, v := range slugToOrgID {
		m[k] = v
	}
	return &SportResolver{slugToOrgID: m}
}

// OrgID returns the Logto organization ID for the given sport slug, or
// empty string if the slug is unknown.
func (s *SportResolver) OrgID(slug string) string {
	return s.slugToOrgID[slug]
}

// RequireSportMatchesJWT returns a chi middleware that requires the
// X-Sport header to be present, validates the slug exists in the resolver,
// and confirms the JWT's organization_id claim matches the sport's Logto
// org ID. Must be used AFTER RequireJWT so that auth.Claims is on the
// request context.
//
// Errors (in checking order):
//
//	400 - X-Sport header missing
//	400 - sport slug unknown to the resolver
//	500 - claims missing from context (programmer error: middleware not
//	      chained behind RequireJWT)
//	403 - claims.OrganizationID does not match the sport's Logto org ID
func RequireSportMatchesJWT(r *SportResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			slug := req.Header.Get("X-Sport")
			if slug == "" {
				writeError(w, http.StatusBadRequest, "bad_request", "missing X-Sport header")
				return
			}

			expectedOrgID := r.OrgID(slug)
			if expectedOrgID == "" {
				writeError(w, http.StatusBadRequest, "bad_request", "unknown sport: "+slug)
				return
			}

			claims, ok := auth.ClaimsFromContext(req.Context())
			if !ok {
				// Programmer error: RequireSportMatchesJWT is running
				// without RequireJWT in front of it. Fail closed and log
				// loudly so it's caught in development.
				slog.ErrorContext(req.Context(),
					"sport middleware: no claims in context (RequireJWT not chained)")
				writeError(w, http.StatusInternalServerError, "internal_error",
					"server configuration error")
				return
			}

			if claims.OrganizationID != expectedOrgID {
				writeError(w, http.StatusForbidden, "forbidden",
					"sport does not match your current session's organization")
				return
			}

			next.ServeHTTP(w, req)
		})
	}
}
