// Package auth provides JWT validation and Logto claims extraction for the
// Court Command API. It is consumed by the chi middleware that authenticates
// every protected request and stores the normalized Claims in the request
// context for downstream handlers.
package auth

import (
	"context"
	"strings"

	"github.com/lestrrat-go/jwx/v3/jwt"
)

// Claims is the normalized subset of JWT claims Court Command cares about.
// It is intentionally narrower than the full set of fields jwx exposes so
// handlers don't have to know about jwx types.
type Claims struct {
	Subject           string   // Logto user ID (sub claim)
	OrganizationID    string   // organization_id claim, empty if not org-scoped
	OrganizationRoles []string // organization_roles claim
	Scopes            []string // parsed scope claim (space-separated string -> slice)
	Audience          []string // aud claim
}

// HasScope reports whether the token has the given OAuth scope.
func (c Claims) HasScope(scope string) bool {
	for _, s := range c.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// HasOrgRole reports whether the token's organization_roles contains role.
// Returns false for non-org-scoped tokens (where OrganizationRoles is empty).
func (c Claims) HasOrgRole(role string) bool {
	for _, r := range c.OrganizationRoles {
		if r == role {
			return true
		}
	}
	return false
}

// orgRoleToLocalRole maps a Logto organization-role name to the local
// users.role string the rest of the app authorizes against. The Logto
// org-roles are defined by the seeder (api/logtoseed/seeder.go:orgRoles)
// and the local users.role values by the CHECK constraint in
// api/db/migrations/00030_expand_user_roles.sql. The five Logto org-roles
// happen to share names with their local counterparts, but we map
// explicitly rather than passing the string through so an unrecognized
// org-role never silently becomes a users.role value (which would violate
// the DB constraint and skip the intended authz surface).
//
// orgRolePriority orders the local roles from most to least privileged so
// ElevatedRole can pick the single highest role when a user holds several
// org-roles in the same org. platform_admin must always win.
var orgRoleToLocalRole = map[string]string{
	"platform_admin":      "platform_admin",
	"tournament_director": "tournament_director",
	"referee":             "referee",
	"scorekeeper":         "scorekeeper",
	"player":              "player",
}

var orgRolePriority = map[string]int{
	"platform_admin":      5,
	"tournament_director": 4,
	"referee":             3,
	"scorekeeper":         2,
	"player":              1,
}

// ElevatedRole maps the Logto org-roles in the token to the single local
// users.role string that handler-level authz checks (RequirePlatformAdmin,
// sidebar nav visibility, scoring/broadcast gating, etc.) expect. Returns
// "" when no recognized org-role is present and the caller should keep the
// local DB role.
//
// When the token carries multiple org-roles, the highest-privilege role
// wins (see orgRolePriority); platform_admin always takes precedence.
// Unrecognized org-role names are ignored so they can never map to a
// users.role value the DB constraint doesn't allow.
//
// IMPORTANT: relies on c.OrganizationRoles, which Logto only populates
// when the token is org-scoped (i.e. issued for audience
// urn:logto:organization:<orgID>). The Court Command SPA always
// requests org-scoped tokens via getAccessToken(resource, orgID) so this
// works in practice. Logto also frequently omits the organization_roles
// claim from API-resource access tokens entirely; the JWTSession
// middleware falls back to the Logto Management API resolver in that case
// (see api/middleware/jwt_session.go). A future caller using a
// globally-scoped token will see an empty OrganizationRoles and no
// elevation will happen -- the user falls back to their local users.role.
func (c Claims) ElevatedRole() string {
	best := ""
	bestPriority := 0
	for _, role := range c.OrganizationRoles {
		local, ok := orgRoleToLocalRole[role]
		if !ok {
			continue
		}
		if p := orgRolePriority[role]; p > bestPriority {
			best = local
			bestPriority = p
		}
	}
	return best
}

// ExtractClaims pulls Logto-shaped claims off a parsed jwx token. It is
// tolerant of the two ways jwx may surface the organization_roles array:
// when set programmatically in tests it arrives as []string; when parsed
// from a JSON token over the wire jwx surfaces it as []interface{}.
func ExtractClaims(token jwt.Token) Claims {
	c := Claims{}

	if sub, ok := token.Subject(); ok {
		c.Subject = sub
	}
	if aud, ok := token.Audience(); ok {
		c.Audience = aud
	}

	var orgID string
	if err := token.Get("organization_id", &orgID); err == nil {
		c.OrganizationID = orgID
	}

	// organization_roles may arrive as []string or []interface{} depending on
	// whether the token was constructed in-process or parsed from JSON.
	var rolesAny interface{}
	if err := token.Get("organization_roles", &rolesAny); err == nil {
		c.OrganizationRoles = toStringSlice(rolesAny)
	}

	var scopeStr string
	if err := token.Get("scope", &scopeStr); err == nil && scopeStr != "" {
		c.Scopes = strings.Fields(scopeStr)
	}

	return c
}

// toStringSlice coerces []string or []interface{} values into []string,
// dropping any element that isn't a string. Returns nil for any other type.
func toStringSlice(v interface{}) []string {
	switch t := v.(type) {
	case []string:
		out := make([]string, len(t))
		copy(out, t)
		return out
	case []interface{}:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

// ctxKey is a private type so context keys defined in this package can never
// collide with keys defined elsewhere in the codebase.
type ctxKey struct{}

var claimsKey = ctxKey{}

// WithClaims returns a copy of ctx that carries c. Used by the JWT middleware
// after a token has been validated.
func WithClaims(ctx context.Context, c Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

// ClaimsFromContext returns the Claims stored on ctx by WithClaims, if any.
// The bool return is false when there are no claims (unauthenticated request).
func ClaimsFromContext(ctx context.Context) (Claims, bool) {
	c, ok := ctx.Value(claimsKey).(Claims)
	return c, ok
}
