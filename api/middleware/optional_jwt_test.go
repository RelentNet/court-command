// api/middleware/optional_jwt_test.go
//
// OptionalJWT tests focus on the permissive paths -- the populate path
// is the same as JWTSession's and is covered by jwt_session_test.go.
// Here we verify that bad/missing tokens, broken Logto, and broken DBs
// all result in pass-through (no session.Data, no 4xx/5xx response).

package middleware_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/middleware"
	"github.com/court-command/court-command/session"
	"github.com/jackc/pgx/v5"
	"github.com/lestrrat-go/jwx/v3/jwt"
	"github.com/stretchr/testify/require"
)

// optionalJWTRunner wires up the middleware and runs a single GET /x
// request through it. Returns whether the downstream handler was
// reached and the session.Data observed (nil if not populated).
func optionalJWTRunner(
	t *testing.T,
	v *auth.Validator,
	queries middleware.JWTSessionQueries,
	fetcher middleware.LogtoUserFetcher,
	syncer middleware.UserSyncer,
	authHeader string,
) (sess *session.Data, reached bool, status int) {
	t.Helper()
	mw := middleware.OptionalJWT(v, fetcher, queries, syncer, nil)
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		sess = session.SessionData(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/x", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	h.ServeHTTP(rr, req)
	return sess, reached, rr.Code
}

// TestOptionalJWT_NoHeader_PassesThrough: anonymous request gets through
// with no session.Data; downstream handler runs normally.
func TestOptionalJWT_NoHeader_PassesThrough(t *testing.T) {
	priv, jwksURL := testKey(t)
	_ = priv
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)

	sess, reached, status := optionalJWTRunner(t, v,
		&fakeQueries{}, &fakeFetcher{}, &fakeSyncer{}, "")

	require.True(t, reached, "downstream must be reached on anonymous request")
	require.Nil(t, sess, "session.Data must NOT be set without auth")
	require.Equal(t, http.StatusOK, status)
}

// TestOptionalJWT_ExpiredToken_PassesThrough: expired tokens result in
// pass-through (NOT 401). Treat token errors as "user might be anonymous"
// rather than rejecting -- mixed-auth routes are reachable without auth.
func TestOptionalJWT_ExpiredToken_PassesThrough(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)

	// Mint a token whose exp is in the past.
	signed := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:      "logto-user-id-abc",
		jwt.AudienceKey:     []string{testAPIaud},
		jwt.IssuedAtKey:     time.Now().Add(-1 * time.Hour),
		jwt.ExpirationKey:   time.Now().Add(-30 * time.Minute),
	})

	sess, reached, status := optionalJWTRunner(t, v,
		&fakeQueries{}, &fakeFetcher{}, &fakeSyncer{}, "Bearer "+signed)

	require.True(t, reached, "downstream must be reached even on expired token")
	require.Nil(t, sess, "session.Data must NOT be set when token rejected")
	require.Equal(t, http.StatusOK, status, "OptionalJWT must NOT short-circuit on expired tokens")
}

// TestOptionalJWT_ValidToken_PopulatesSession: happy path. With a valid
// token + existing local mirror row, OptionalJWT populates session.Data
// just like JWTSession.
func TestOptionalJWT_ValidToken_PopulatesSession(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	signed := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "logto-user-id-abc",
		jwt.AudienceKey: []string{testAPIaud},
	})

	user := makeUser()
	queries := &fakeQueries{user: user}

	sess, reached, status := optionalJWTRunner(t, v,
		queries, &fakeFetcher{}, &fakeSyncer{}, "Bearer "+signed)

	require.True(t, reached)
	require.Equal(t, http.StatusOK, status)
	require.NotNil(t, sess, "valid token must populate session.Data")
	require.Equal(t, int64(42), sess.UserID)
	require.Equal(t, "platform_admin", sess.Role)
}

// TestOptionalJWT_DBLookupError_PassesThrough: if the local DB query
// fails for reasons other than ErrNoRows (e.g. transient connection
// issue), OptionalJWT must NOT 500 a public read. Pass through and let
// the handler decide.
func TestOptionalJWT_DBLookupError_PassesThrough(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	signed := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "logto-user-id-abc",
		jwt.AudienceKey: []string{testAPIaud},
	})

	queries := &fakeQueries{err: errors.New("connection refused")}

	sess, reached, status := optionalJWTRunner(t, v,
		queries, &fakeFetcher{}, &fakeSyncer{}, "Bearer "+signed)

	require.True(t, reached)
	require.Nil(t, sess, "DB error must NOT populate session.Data")
	require.Equal(t, http.StatusOK, status, "OptionalJWT must NOT short-circuit on DB errors")
}

// TestOptionalJWT_LogtoUnreachable_PassesThrough: if the local mirror
// is missing AND Logto is unreachable, OptionalJWT must pass through
// (NOT 503). Public reads should survive Logto outages.
func TestOptionalJWT_LogtoUnreachable_PassesThrough(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	signed := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "logto-user-id-abc",
		jwt.AudienceKey: []string{testAPIaud},
	})

	queries := &fakeQueries{err: pgx.ErrNoRows}
	fetcher := &fakeFetcher{err: errors.New("connection refused")}

	sess, reached, status := optionalJWTRunner(t, v,
		queries, fetcher, &fakeSyncer{}, "Bearer "+signed)

	require.True(t, reached)
	require.Nil(t, sess)
	require.Equal(t, http.StatusOK, status, "OptionalJWT must NOT 503 on Logto outage")
}

// TestOptionalJWT_PreExistingSession_PreservesIt: if OptionalAuth (or any
// other earlier middleware) already populated session.Data, OptionalJWT
// must NOT clobber it -- even if the request also carries a JWT.
func TestOptionalJWT_PreExistingSession_PreservesIt(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	signed := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "logto-user-id-abc",
		jwt.AudienceKey: []string{testAPIaud},
	})

	// Pre-populated session.Data from "OptionalAuth" simulation.
	preData := &session.Data{UserID: 999, Role: "player", PublicID: "CC-99999"}

	mw := middleware.OptionalJWT(v, &fakeFetcher{},
		&fakeQueries{user: makeUser()}, &fakeSyncer{}, nil)
	var observed *session.Data
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed = session.SessionData(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	req = req.WithContext(session.SetSessionData(req.Context(), preData))
	h.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	require.NotNil(t, observed)
	require.Equal(t, int64(999), observed.UserID, "pre-existing session must NOT be replaced by JWT")
	require.Equal(t, "player", observed.Role)
}

// TestOptionalJWT_ElevatedRoleFromClaims: when the token claims include
// 'platform_admin' in organization_roles, OptionalJWT overrides the
// local users.role for THIS request. Verifies the C2 fix from the
// Phase 3.5 review.
func TestOptionalJWT_ElevatedRoleFromClaims(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	signed := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "logto-user-id-abc",
		jwt.AudienceKey: []string{testAPIaud},
		// organization_roles is not a top-level field; it lives under
		// the org-scoped token shape. mintToken just sets it as a
		// custom claim and ExtractClaims unpacks it.
		"organization_roles": []string{"platform_admin", "tournament_director"},
	})

	// Local row says role=player (the default for newly-mirrored users).
	playerRole := "player"
	playerEmail := "newbie@example.com"
	user := makeUser()
	user.Role = playerRole
	user.Email = &playerEmail

	queries := &fakeQueries{user: user}

	sess, reached, status := optionalJWTRunner(t, v,
		queries, &fakeFetcher{}, &fakeSyncer{}, "Bearer "+signed)

	require.True(t, reached)
	require.Equal(t, http.StatusOK, status)
	require.NotNil(t, sess)
	require.Equal(t, "platform_admin", sess.Role,
		"claims with platform_admin org-role must override local users.role")
}


