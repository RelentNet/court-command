// api/middleware/org_role_resolver_test.go
//
// Tests for LogtoMgmtAPIResolver and the OrgRoleResolver interface.
// Avoid adding external dependencies for Redis: the resolver works
// without Redis (just calls Logto every time) and that's the path we
// exercise here. The end-to-end caching behavior is verified in
// production via the api boot logs and JWT inspection -- adding
// miniredis as a test dep just to cover one branch isn't worth it
// given we already have integration coverage at the Coolify layer.

package middleware_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/court-command/court-command/middleware"
)

// fakeLogtoOrgClient is the test stub for the resolver's underlying
// Logto Mgmt API client. Records the (orgID, userID) pairs it sees so
// tests can assert call counts.
type fakeLogtoOrgClient struct {
	roles map[string][]string // key = orgID+":"+userID
	err   error
	calls int
}

func (f *fakeLogtoOrgClient) GetUserOrganizationRoles(_ context.Context, orgID, userID string) ([]string, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	if f.roles == nil {
		return nil, nil
	}
	return f.roles[orgID+":"+userID], nil
}

func TestLogtoMgmtAPIResolver_NoRedis_AlwaysCallsLogto(t *testing.T) {
	t.Parallel()
	// nil Redis -> resolver still works; every call pays the Logto round-trip.
	fc := &fakeLogtoOrgClient{
		roles: map[string][]string{"o:u": {"platform_admin"}},
	}
	r := middleware.NewLogtoMgmtAPIResolver(fc, nil, 60*time.Second)

	for i := 1; i <= 3; i++ {
		got, err := r.GetUserOrganizationRoles(context.Background(), "o", "u")
		require.NoError(t, err)
		require.Equal(t, []string{"platform_admin"}, got)
		require.Equal(t, i, fc.calls, "every call hits Logto without cache")
	}
}

func TestLogtoMgmtAPIResolver_NoRedis_PassesThroughNilRoles(t *testing.T) {
	t.Parallel()
	// User has no roles in this org: resolver returns empty slice
	// (NOT nil) so consumers can range over the result safely.
	fc := &fakeLogtoOrgClient{
		roles: map[string][]string{}, // no entry for "o:u" -> nil from underlying
	}
	r := middleware.NewLogtoMgmtAPIResolver(fc, nil, 60*time.Second)

	got, err := r.GetUserOrganizationRoles(context.Background(), "o", "u-without-roles")
	require.NoError(t, err)
	require.NotNil(t, got, "should normalize nil to empty slice")
	require.Empty(t, got)
}

func TestLogtoMgmtAPIResolver_NoRedis_LogtoError_Propagates(t *testing.T) {
	t.Parallel()
	fc := &fakeLogtoOrgClient{err: errors.New("logto unreachable")}
	r := middleware.NewLogtoMgmtAPIResolver(fc, nil, 60*time.Second)

	_, err := r.GetUserOrganizationRoles(context.Background(), "o", "u")
	require.Error(t, err)
	require.Contains(t, err.Error(), "logto unreachable")
}

func TestOrgRolesCacheTTLFromEnv_DefaultWhenUnset(t *testing.T) {
	t.Setenv("LOGTO_ORG_ROLES_CACHE_TTL_SECONDS", "")
	ttl := middleware.OrgRolesCacheTTLFromEnv()
	require.Equal(t, middleware.DefaultOrgRolesCacheTTL, ttl)
}

func TestOrgRolesCacheTTLFromEnv_ParsesValue(t *testing.T) {
	t.Setenv("LOGTO_ORG_ROLES_CACHE_TTL_SECONDS", "120")
	ttl := middleware.OrgRolesCacheTTLFromEnv()
	require.Equal(t, 120*time.Second, ttl)
}

func TestOrgRolesCacheTTLFromEnv_FallsBackOnGarbage(t *testing.T) {
	t.Setenv("LOGTO_ORG_ROLES_CACHE_TTL_SECONDS", "not-a-number")
	ttl := middleware.OrgRolesCacheTTLFromEnv()
	require.Equal(t, middleware.DefaultOrgRolesCacheTTL, ttl)
}

func TestOrgRolesCacheTTLFromEnv_FallsBackOnNegative(t *testing.T) {
	t.Setenv("LOGTO_ORG_ROLES_CACHE_TTL_SECONDS", "-5")
	ttl := middleware.OrgRolesCacheTTLFromEnv()
	require.Equal(t, middleware.DefaultOrgRolesCacheTTL, ttl)
}
