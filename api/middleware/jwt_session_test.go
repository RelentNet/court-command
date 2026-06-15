// api/middleware/jwt_session_test.go
//
// Unit tests for JWTSession. Reuses the fakeQueries/fakeFetcher/
// fakeSyncer fakes from mirror_user_test.go (same package). These
// fakes already satisfy LogtoUserFetcher, JWTSessionQueries, and
// UserSyncer.
package middleware_test

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/middleware"
	"github.com/court-command/court-command/session"
)

// makeUser builds a canned generated.User for assertions.
func makeUser() generated.User {
	email := "admin@courtcommand.local"
	createdAt := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	return generated.User{
		ID:        42,
		PublicID:  "CC-10042",
		Email:     &email,
		Role:      "platform_admin",
		CreatedAt: createdAt,
	}
}

// fakeQueriesWithSecondCall lets us simulate the post-mirror re-read
// returning a different row than the initial lookup. The first call
// returns ErrNoRows; the second returns the canned user.
type fakeQueriesWithSecondCall struct {
	*fakeQueries
	secondUser generated.User
	calls      int
}

func (f *fakeQueriesWithSecondCall) GetUserByLogtoUserID(ctx context.Context, logtoUserID *string) (generated.User, error) {
	f.calls++
	if f.calls == 1 {
		return f.fakeQueries.GetUserByLogtoUserID(ctx, logtoUserID)
	}
	// Second call: return the post-mirror row.
	return f.secondUser, nil
}

// jwtSessionRunner wraps runMW so a downstream handler can capture the
// session.Data populated on the request context.
func jwtSessionRunner(
	t *testing.T,
	queries middleware.JWTSessionQueries,
	fetcher middleware.LogtoUserFetcher,
	syncer middleware.UserSyncer,
	claims *auth.Claims,
) (*captured, bool, int) {
	t.Helper()
	// Pass nil for OrgRoleResolver in existing tests -- the Mgmt-API
	// elevation path is exercised in TestJWTSession_OrgRoleResolver_*.
	mw := middleware.JWTSession(fetcher, queries, syncer, nil)
	cap := &captured{}
	reached := false
	var status int
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		cap.data = session.SessionData(r.Context())
		w.WriteHeader(http.StatusOK)
		status = http.StatusOK
	}))
	rr, _ := runMWHelper(h, claims)
	if !reached {
		status = rr.Code
	}
	return cap, reached, status
}

type captured struct {
	data *session.Data
}

// runMWHelper is a thin wrapper to hide the extra signature -- the
// existing runMW takes a func(http.Handler) http.Handler, but here
// we already have the wrapped handler. Re-implement the recorder.
func runMWHelper(h http.Handler, claims *auth.Claims) (*recorder, bool) {
	rr := newRecorder()
	req := newReq()
	if claims != nil {
		req = req.WithContext(auth.WithClaims(req.Context(), *claims))
	}
	h.ServeHTTP(rr, req)
	return rr, rr.Code != 0
}

// Re-export the testing helper types from runMW for our use; we
// can't import test files across packages, so we inline minimal copies.
type recorder struct {
	Code int
	Body []byte
}

func newRecorder() *recorder { return &recorder{} }
func (r *recorder) Header() http.Header {
	return http.Header{}
}
func (r *recorder) Write(b []byte) (int, error) { r.Body = append(r.Body, b...); return len(b), nil }
func (r *recorder) WriteHeader(s int)           { r.Code = s }

func newReq() *http.Request {
	req, _ := http.NewRequest(http.MethodGet, "/x", nil)
	return req
}

// --- Tests --------------------------------------------------------

// TestJWTSession_PopulatesSessionData_WhenRowExists: happy path. The
// queries fake returns the user immediately; no Logto fetch happens;
// downstream sees session.Data with the right fields.
func TestJWTSession_PopulatesSessionData_WhenRowExists(t *testing.T) {
	user := makeUser()
	queries := &fakeQueries{user: user, err: nil}
	fetcher := &fakeFetcher{} // should NOT be called
	syncer := &fakeSyncer{}
	claims := &auth.Claims{Subject: "logto-user-id-abc"}

	cap, reached, _ := jwtSessionRunner(t, queries, fetcher, syncer, claims)

	require.True(t, reached, "downstream should be reached")
	require.NotNil(t, cap.data, "session.Data should be set on context")
	require.Equal(t, int64(42), cap.data.UserID)
	require.Equal(t, "admin@courtcommand.local", cap.data.Email)
	require.Equal(t, "platform_admin", cap.data.Role)
	require.Equal(t, "CC-10042", cap.data.PublicID)
	require.Equal(t, 0, len(syncer.calls), "no upsert should happen")
	require.Equal(t, 0, fetcher.calls, "no Logto fetch should happen")
}

// TestJWTSession_FetchesAndUpserts_WhenNoRow: cold cache. First
// queries call returns ErrNoRows; middleware fetches from Logto,
// upserts, re-reads. Downstream sees the post-mirror user.
func TestJWTSession_FetchesAndUpserts_WhenNoRow(t *testing.T) {
	user := makeUser()
	queries := &fakeQueriesWithSecondCall{
		fakeQueries: &fakeQueries{user: generated.User{}, err: pgx.ErrNoRows},
		secondUser:  user,
	}
	fetcher := &fakeFetcher{
		user: &logto.LogtoUser{
			ID:           "logto-user-id-abc",
			PrimaryEmail: "admin@courtcommand.local",
			Name:         "Local Admin",
		},
	}
	syncer := &fakeSyncer{}
	claims := &auth.Claims{Subject: "logto-user-id-abc"}

	cap, reached, _ := jwtSessionRunner(t, queries, fetcher, syncer, claims)

	require.True(t, reached)
	require.Equal(t, int64(42), cap.data.UserID)
	require.Equal(t, "platform_admin", cap.data.Role)
	require.Equal(t, 1, fetcher.calls, "Logto should be fetched once")
	require.Equal(t, 1, len(syncer.calls), "upsert should happen once")
	require.Equal(t, 2, queries.calls, "GetUserByLogtoUserID should be called twice (lookup + post-upsert re-read)")
}

// TestJWTSession_NoClaims_Returns500: programmer error path. If
// RequireJWT didn't run upstream, the bridge writes 500 INTERNAL_ERROR
// because reaching this state means the route is misconfigured.
func TestJWTSession_NoClaims_Returns500(t *testing.T) {
	queries := &fakeQueries{}
	fetcher := &fakeFetcher{}
	syncer := &fakeSyncer{}

	cap, reached, status := jwtSessionRunner(t, queries, fetcher, syncer, nil)

	require.False(t, reached, "downstream must NOT be reached without claims")
	require.Equal(t, http.StatusInternalServerError, status)
	require.Nil(t, cap.data)
}

// TestJWTSession_LogtoFails_Returns503: the Logto Mgmt API is down
// when we need to mirror a brand-new user. Middleware writes 503 and
// downstream is not reached.
func TestJWTSession_LogtoFails_Returns503(t *testing.T) {
	queries := &fakeQueries{user: generated.User{}, err: pgx.ErrNoRows}
	fetcher := &fakeFetcher{err: errors.New("logto unreachable")}
	syncer := &fakeSyncer{}
	claims := &auth.Claims{Subject: "logto-user-id-abc"}

	_, reached, status := jwtSessionRunner(t, queries, fetcher, syncer, claims)

	require.False(t, reached, "downstream must not be reached if Logto fetch fails")
	require.Equal(t, http.StatusServiceUnavailable, status)
}

// --- OrgRoleResolver elevation tests ------------------------------
//
// These tests exercise the Path-2 (Mgmt API) elevation introduced to
// work around Logto's behavior of NOT emitting organization_roles on
// API-resource access tokens.

// fakeOrgRoleResolver is an in-memory stub for the OrgRoleResolver
// interface. roles is keyed by orgID+":"+userID just like the real
// LogtoMgmtAPIResolver's internal cache.
type fakeOrgRoleResolver struct {
	roles map[string][]string
	err   error
	calls int
}

func (f *fakeOrgRoleResolver) GetUserOrganizationRoles(_ context.Context, orgID, userID string) ([]string, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return f.roles[orgID+":"+userID], nil
}

// jwtSessionWithResolver mirrors jwtSessionRunner but passes a
// resolver into the middleware constructor.
func jwtSessionWithResolver(
	t *testing.T,
	queries middleware.JWTSessionQueries,
	fetcher middleware.LogtoUserFetcher,
	syncer middleware.UserSyncer,
	resolver middleware.OrgRoleResolver,
	claims *auth.Claims,
) (*captured, bool) {
	t.Helper()
	mw := middleware.JWTSession(fetcher, queries, syncer, resolver)
	cap := &captured{}
	reached := false
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		cap.data = session.SessionData(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	runMWHelper(h, claims)
	return cap, reached
}

// TestJWTSession_OrgRoleResolver_ElevatesToPlatformAdmin: the local
// DB has the user as 'player' (default), the JWT has organization_id
// but no organization_roles claim, and the resolver reports
// platform_admin for that user/org. Expected: data.Role flips to
// platform_admin so downstream RequirePlatformAdmin lets the request
// through.
func TestJWTSession_OrgRoleResolver_ElevatesToPlatformAdmin(t *testing.T) {
	u := makeUser()
	u.Role = "player" // default-after-JIT-provision
	queries := &fakeQueries{user: u}
	fetcher := &fakeFetcher{}
	syncer := &fakeSyncer{}
	resolver := &fakeOrgRoleResolver{
		roles: map[string][]string{
			"vcx906e38a2v:logto-user-id-abc": {"platform_admin"},
		},
	}
	claims := &auth.Claims{
		Subject:        "logto-user-id-abc",
		OrganizationID: "vcx906e38a2v",
		// Note: NO OrganizationRoles -- this is Logto's actual behavior.
	}

	cap, reached := jwtSessionWithResolver(t, queries, fetcher, syncer, resolver, claims)

	require.True(t, reached)
	require.Equal(t, "platform_admin", cap.data.Role, "Mgmt API path should elevate")
	require.Equal(t, 1, resolver.calls, "resolver should be called once")
}

// TestJWTSession_OrgRoleResolver_NoElevationWhenUserHasNoOrgRoles:
// resolver returns empty slice (user is a member but has no roles).
// Expected: data.Role stays as the local DB value ('player').
func TestJWTSession_OrgRoleResolver_NoElevationWhenUserHasNoOrgRoles(t *testing.T) {
	u := makeUser()
	u.Role = "player"
	queries := &fakeQueries{user: u}
	resolver := &fakeOrgRoleResolver{
		roles: map[string][]string{},
	}
	claims := &auth.Claims{
		Subject:        "logto-user-id-abc",
		OrganizationID: "vcx906e38a2v",
	}

	cap, reached := jwtSessionWithResolver(t, queries, &fakeFetcher{}, &fakeSyncer{}, resolver, claims)

	require.True(t, reached)
	require.Equal(t, "player", cap.data.Role, "no roles -> no elevation")
}

// TestJWTSession_OrgRoleResolver_SkippedWhenNoOrgInJWT: the JWT has no
// organization_id claim (e.g. resource-only token from the bare-root
// path). Expected: resolver is NOT called and role stays as DB.
func TestJWTSession_OrgRoleResolver_SkippedWhenNoOrgInJWT(t *testing.T) {
	u := makeUser()
	u.Role = "player"
	queries := &fakeQueries{user: u}
	resolver := &fakeOrgRoleResolver{
		// Even if the resolver WOULD say platform_admin, it shouldn't
		// be called because we have no org context.
		roles: map[string][]string{"any:logto-user-id-abc": {"platform_admin"}},
	}
	claims := &auth.Claims{
		Subject: "logto-user-id-abc",
		// OrganizationID is empty
	}

	cap, reached := jwtSessionWithResolver(t, queries, &fakeFetcher{}, &fakeSyncer{}, resolver, claims)

	require.True(t, reached)
	require.Equal(t, "player", cap.data.Role)
	require.Equal(t, 0, resolver.calls, "resolver must not be called without org context")
}

// TestJWTSession_OrgRoleResolver_SkippedWhenAlreadyPlatformAdmin: the
// local DB already has the user as platform_admin (perhaps from a
// manual admin promote). Expected: resolver is NOT called -- we don't
// downgrade or even re-check.
func TestJWTSession_OrgRoleResolver_SkippedWhenAlreadyPlatformAdmin(t *testing.T) {
	u := makeUser() // role = "platform_admin"
	queries := &fakeQueries{user: u}
	resolver := &fakeOrgRoleResolver{
		// Resolver could say "no roles" but we shouldn't call it -- the
		// DB authority wins for users who are already at the top.
		roles: map[string][]string{},
	}
	claims := &auth.Claims{
		Subject:        "logto-user-id-abc",
		OrganizationID: "vcx906e38a2v",
	}

	cap, reached := jwtSessionWithResolver(t, queries, &fakeFetcher{}, &fakeSyncer{}, resolver, claims)

	require.True(t, reached)
	require.Equal(t, "platform_admin", cap.data.Role)
	require.Equal(t, 0, resolver.calls, "resolver must not be called for already-admin users")
}

// TestJWTSession_OrgRoleResolver_ContinuesOnResolverError: Logto Mgmt
// API is down. We should NOT 503 -- just fall through to the local
// DB role. A logged warning is fine; the test asserts behavior, not
// log output.
func TestJWTSession_OrgRoleResolver_ContinuesOnResolverError(t *testing.T) {
	u := makeUser()
	u.Role = "player"
	queries := &fakeQueries{user: u}
	resolver := &fakeOrgRoleResolver{err: errors.New("logto mgmt api down")}
	claims := &auth.Claims{
		Subject:        "logto-user-id-abc",
		OrganizationID: "vcx906e38a2v",
	}

	cap, reached := jwtSessionWithResolver(t, queries, &fakeFetcher{}, &fakeSyncer{}, resolver, claims)

	require.True(t, reached, "request must not fail when resolver errors")
	require.Equal(t, "player", cap.data.Role)
}

// TestJWTSession_JWTFastPath_StillWorks: if Logto ever DOES start
// emitting organization_roles in access tokens (or a customizer is
// configured), the fast path should keep working without consulting
// the resolver.
func TestJWTSession_JWTFastPath_StillWorks(t *testing.T) {
	u := makeUser()
	u.Role = "player"
	queries := &fakeQueries{user: u}
	resolver := &fakeOrgRoleResolver{
		roles: map[string][]string{"vcx906e38a2v:logto-user-id-abc": {"platform_admin"}},
	}
	claims := &auth.Claims{
		Subject:           "logto-user-id-abc",
		OrganizationID:    "vcx906e38a2v",
		OrganizationRoles: []string{"platform_admin"}, // JWT carried the claim
	}

	cap, reached := jwtSessionWithResolver(t, queries, &fakeFetcher{}, &fakeSyncer{}, resolver, claims)

	require.True(t, reached)
	require.Equal(t, "platform_admin", cap.data.Role, "JWT fast path should elevate")
	require.Equal(t, 0, resolver.calls, "resolver must NOT be called when JWT already elevated")
}

// --- helpers ------------------------------------------------------


