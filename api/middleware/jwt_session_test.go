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
	mw := middleware.JWTSession(fetcher, queries, syncer)
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

// --- helpers ------------------------------------------------------


