// api/middleware/mirror_user_test.go
//
// Unit tests for MirrorUser. The middleware accepts small interfaces
// (LogtoUserFetcher, UserMirrorQueries, UserSyncer) so we substitute
// hand-rolled fakes -- no Postgres, no httptest Logto server.
package middleware_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/middleware"
	"github.com/court-command/court-command/service"
)

// fakeQueries records GetUserByLogtoUserID calls and returns either a
// canned User+nil (row exists) or zero+pgx.ErrNoRows or zero+err.
type fakeQueries struct {
	user generated.User
	err  error
	// captured input
	calledWith *string
}

func (f *fakeQueries) GetUserByLogtoUserID(_ context.Context, logtoUserID *string) (generated.User, error) {
	f.calledWith = logtoUserID
	return f.user, f.err
}

// fakeFetcher records GetUser calls and returns canned data.
type fakeFetcher struct {
	user *logto.LogtoUser
	err  error
	// captured
	calls int
}

func (f *fakeFetcher) GetUser(_ context.Context, _ string) (*logto.LogtoUser, error) {
	f.calls++
	return f.user, f.err
}

// fakeSyncer records UpsertFromLogto calls and returns canned err.
type fakeSyncer struct {
	err   error
	calls []service.LogtoUserUpsert
}

func (f *fakeSyncer) UpsertFromLogto(_ context.Context, in service.LogtoUserUpsert) error {
	f.calls = append(f.calls, in)
	return f.err
}

// runMW invokes the middleware with the given fakes and returns
// (response recorder, downstreamReached).
func runMW(t *testing.T, mw func(http.Handler) http.Handler, claims *auth.Claims) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	reached := false
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	if claims != nil {
		req = req.WithContext(auth.WithClaims(req.Context(), *claims))
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr, reached
}

// TestMirrorUser_PassesThrough_WhenRowExists: the fake queries returns
// a user (no error). Logto fetcher must NOT be called, the downstream
// handler IS reached, no upsert.
func TestMirrorUser_PassesThrough_WhenRowExists(t *testing.T) {
	q := &fakeQueries{user: generated.User{ID: 42}, err: nil}
	f := &fakeFetcher{}
	s := &fakeSyncer{}
	mw := middleware.MirrorUser(f, q, s)

	claims := auth.Claims{Subject: "logto_existing"}
	rr, reached := runMW(t, mw, &claims)

	if !reached {
		t.Fatalf("downstream handler should be reached when row exists")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	if f.calls != 0 {
		t.Errorf("Logto fetcher must not be called when row exists, got %d calls", f.calls)
	}
	if len(s.calls) != 0 {
		t.Errorf("upsert must not be called when row exists, got %d", len(s.calls))
	}
	if q.calledWith == nil || *q.calledWith != "logto_existing" {
		t.Errorf("queries called with wrong subject: %v", q.calledWith)
	}
}

// TestMirrorUser_FetchesAndUpserts_WhenNoRow: queries returns
// pgx.ErrNoRows, Logto returns a user, upsert is called, downstream
// handler is reached.
func TestMirrorUser_FetchesAndUpserts_WhenNoRow(t *testing.T) {
	q := &fakeQueries{err: pgx.ErrNoRows}
	f := &fakeFetcher{
		user: &logto.LogtoUser{
			ID:           "logto_new",
			PrimaryEmail: "new@example.com",
			Name:         "New User",
		},
	}
	s := &fakeSyncer{}
	mw := middleware.MirrorUser(f, q, s)

	claims := auth.Claims{Subject: "logto_new"}
	rr, reached := runMW(t, mw, &claims)

	if !reached {
		t.Fatalf("downstream handler should be reached after successful upsert")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	if f.calls != 1 {
		t.Errorf("Logto fetcher should be called exactly once, got %d", f.calls)
	}
	if len(s.calls) != 1 {
		t.Fatalf("upsert should be called exactly once, got %d", len(s.calls))
	}
	got := s.calls[0]
	if got.LogtoUserID != "logto_new" {
		t.Errorf("upsert LogtoUserID: got %q want logto_new", got.LogtoUserID)
	}
	if got.Email != "new@example.com" {
		t.Errorf("upsert Email: got %q", got.Email)
	}
	if got.FirstName != "New" || got.LastName != "User" {
		t.Errorf("upsert name split wrong: first=%q last=%q", got.FirstName, got.LastName)
	}
	if got.DisplayName != "New User" {
		t.Errorf("upsert DisplayName: got %q", got.DisplayName)
	}
}

// TestMirrorUser_LogtoFails_Returns503: queries says no row, Logto
// fetcher returns an error -- middleware writes 503 and downstream
// handler must NOT be reached.
func TestMirrorUser_LogtoFails_Returns503(t *testing.T) {
	q := &fakeQueries{err: pgx.ErrNoRows}
	f := &fakeFetcher{err: errors.New("connection refused")}
	s := &fakeSyncer{}
	mw := middleware.MirrorUser(f, q, s)

	claims := auth.Claims{Subject: "logto_unreachable"}
	rr, reached := runMW(t, mw, &claims)

	if reached {
		t.Fatalf("downstream handler must NOT be reached when Logto is unreachable")
	}
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d body=%s", rr.Code, rr.Body.String())
	}
	if len(s.calls) != 0 {
		t.Errorf("upsert must not be called when Logto fetch fails")
	}
}
