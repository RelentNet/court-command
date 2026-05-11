// api/middleware/org_role_resolver.go
//
// OrgRoleResolver fills the gap between Logto's published behavior and
// what the api expects:
//
//   - Logto issues access tokens whose `aud` is an API resource indicator
//     and whose `organization_id` claim names a sport org, but it does
//     NOT include the `organization_roles` claim in those tokens. The
//     claim only appears in ID tokens and at the userinfo endpoint per
//     Logto's design (docs.logto.io says so explicitly).
//   - The api's claims.ElevatedRole() reads `organization_roles` from
//     the JWT. With Logto's actual behavior, that slice is always empty
//     on the resource-scoped tokens the SPA sends. Elevation never
//     fires; platform_admin gates stay closed.
//
// This file adds the missing piece: an interface (Resolver) and a
// LogtoMgmtAPIResolver implementation that asks Logto's Management API
// for the user's roles in an org on demand, with Redis caching so we
// don't pay the round-trip on every authenticated request. JWTSession
// calls it in the elevation path; tests pass a fake.
//
// Cache key: `cc:org-roles:{userID}:{orgID}`, value: JSON-encoded slice
// of role names, TTL configurable via LOGTO_ORG_ROLES_CACHE_TTL_SECONDS
// (defaults to 60s). On Redis errors we fall through to the underlying
// Logto call -- correctness over performance during cache outages.
package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// OrgRoleResolver is the elevation-lookup surface JWTSession uses to
// translate (userID, orgID) -> role names. Returns an empty slice (or
// nil) when the user has no roles in the org. Errors only when the
// underlying source genuinely failed; "no roles" is not an error.
type OrgRoleResolver interface {
	GetUserOrganizationRoles(ctx context.Context, orgID, userID string) ([]string, error)
}

// logtoOrgRoleLookup is the slim subset of *logto.Client that the
// production resolver uses. *logto.Client satisfies it; tests stub it.
type logtoOrgRoleLookup interface {
	GetUserOrganizationRoles(ctx context.Context, orgID, userID string) ([]string, error)
}

// LogtoMgmtAPIResolver is the production OrgRoleResolver. It tries
// Redis first, falls through to the Logto Management API, and caches
// successful results. Construct one per app instance (it's stateless
// beyond its injected dependencies).
type LogtoMgmtAPIResolver struct {
	client logtoOrgRoleLookup
	redis  *redis.Client
	ttl    time.Duration
}

// orgRoleCacheKey is exported so the seeder, tests, and ops scripts
// can target the same Redis keys (e.g. for manual invalidation).
// Format keeps userID first so a single SCAN cc:org-roles:<userID>:*
// finds every cached org for one user (useful when a Logto webhook
// for that user fires and we need to invalidate).
func orgRoleCacheKey(userID, orgID string) string {
	return fmt.Sprintf("cc:org-roles:%s:%s", userID, orgID)
}

// DefaultOrgRolesCacheTTL is the TTL for cached org-role responses
// when LOGTO_ORG_ROLES_CACHE_TTL_SECONDS is unset or unparseable.
// 60s strikes a balance: role revocation in Logto becomes visible
// within a minute, while warm caches absorb the bulk of authenticated
// traffic without hitting Logto on every request.
const DefaultOrgRolesCacheTTL = 60 * time.Second

// NewLogtoMgmtAPIResolver builds the production resolver. If
// redisClient is nil the resolver still works -- every call hits
// Logto directly. ttl <= 0 falls back to DefaultOrgRolesCacheTTL.
func NewLogtoMgmtAPIResolver(client logtoOrgRoleLookup, redisClient *redis.Client, ttl time.Duration) *LogtoMgmtAPIResolver {
	if ttl <= 0 {
		ttl = DefaultOrgRolesCacheTTL
	}
	return &LogtoMgmtAPIResolver{
		client: client,
		redis:  redisClient,
		ttl:    ttl,
	}
}

// OrgRolesCacheTTLFromEnv reads LOGTO_ORG_ROLES_CACHE_TTL_SECONDS
// and returns it as a time.Duration. Falls back to
// DefaultOrgRolesCacheTTL on missing / invalid values. Logs a warning
// on parse failure so misconfiguration isn't silent.
func OrgRolesCacheTTLFromEnv() time.Duration {
	raw := os.Getenv("LOGTO_ORG_ROLES_CACHE_TTL_SECONDS")
	if raw == "" {
		return DefaultOrgRolesCacheTTL
	}
	secs, err := strconv.Atoi(raw)
	if err != nil || secs <= 0 {
		slog.Warn("invalid LOGTO_ORG_ROLES_CACHE_TTL_SECONDS; using default",
			"raw", raw, "default_seconds", int(DefaultOrgRolesCacheTTL.Seconds()))
		return DefaultOrgRolesCacheTTL
	}
	return time.Duration(secs) * time.Second
}

// GetUserOrganizationRoles checks Redis first, then Logto. On Redis
// errors (network blip, key corruption) it falls through to Logto so
// the caller still gets a correct answer -- we never reject a request
// purely because the cache is down. On Logto errors it returns the
// error; the caller is expected to skip elevation and proceed with
// the local DB role.
func (r *LogtoMgmtAPIResolver) GetUserOrganizationRoles(ctx context.Context, orgID, userID string) ([]string, error) {
	if r.redis != nil {
		key := orgRoleCacheKey(userID, orgID)
		raw, err := r.redis.Get(ctx, key).Bytes()
		switch {
		case err == nil:
			// Cache hit. Empty JSON arrays decode to []string{}, which
			// is the correct "no roles" answer; we keep negative
			// results in the cache too so absent-from-org users
			// don't hammer Logto on every request.
			var roles []string
			if jerr := json.Unmarshal(raw, &roles); jerr == nil {
				return roles, nil
			}
			// Malformed cache entry: log and fall through to Logto.
			slog.Warn("malformed org-roles cache entry; refetching",
				"key", key, "error", "json unmarshal failed")
		case errors.Is(err, redis.Nil):
			// Cache miss -- normal, fall through to Logto.
		default:
			// Other Redis error -- log and fall through. Don't fail
			// the request just because the cache hiccuped.
			slog.Warn("redis read failed in org-roles resolver; falling through",
				"key", key, "error", err)
		}
	}

	roles, err := r.client.GetUserOrganizationRoles(ctx, orgID, userID)
	if err != nil {
		return nil, err
	}
	if roles == nil {
		// Normalize nil -> empty slice so cache entries are well-formed
		// JSON and consumers can range over them safely.
		roles = []string{}
	}

	if r.redis != nil {
		key := orgRoleCacheKey(userID, orgID)
		payload, jerr := json.Marshal(roles)
		if jerr == nil {
			// SetNX is appropriate here -- if a parallel request just
			// wrote the same value, no harm in skipping the duplicate
			// write. But we WANT to refresh the TTL on hot keys, so
			// use Set (with TTL) instead.
			if rerr := r.redis.Set(ctx, key, payload, r.ttl).Err(); rerr != nil {
				slog.Warn("redis write failed in org-roles resolver",
					"key", key, "error", rerr)
			}
		}
	}

	return roles, nil
}

// containsRole returns true when roles contains target. Pulled out so
// JWTSession can use the same check the resolver uses internally, and
// so tests can verify the role-list shape independently.
func containsRole(roles []string, target string) bool {
	for _, r := range roles {
		if r == target {
			return true
		}
	}
	return false
}
