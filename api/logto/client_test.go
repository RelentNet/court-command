package logto_test

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/court-command/court-command/logto"
	"github.com/stretchr/testify/require"
)

// fakeLogto returns a test server that mimics the two Management API
// endpoints we exercise: POST /oidc/token and GET /api/users/{id}. It
// counts token requests via the supplied atomic and verifies the request
// shape inline (form values, basic auth) so individual tests stay terse.
func fakeLogto(t *testing.T, tokenCount *atomic.Int64, expiresIn int, userHandler http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/oidc/token", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "client_credentials", r.Form.Get("grant_type"))
		require.Equal(t, "https://default.logto.app/api", r.Form.Get("resource"))
		require.Equal(t, "all", r.Form.Get("scope"))

		authz := r.Header.Get("Authorization")
		require.True(t, strings.HasPrefix(authz, "Basic "), "expected Basic auth, got %q", authz)
		raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(authz, "Basic "))
		require.NoError(t, err)
		require.Equal(t, "app:secret", string(raw))

		tokenCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"access_token":"tok-%d","token_type":"Bearer","expires_in":%d}`, tokenCount.Load(), expiresIn)
	})
	if userHandler != nil {
		mux.HandleFunc("/api/users/", userHandler)
	}
	return httptest.NewServer(mux)
}

func newTestClient(endpoint string) *logto.Client {
	return logto.NewClient(logto.Config{
		Endpoint:               endpoint,
		ManagementAPIAppID:     "app",
		ManagementAPIAppSecret: "secret",
		ManagementAPIResource:  "https://default.logto.app/api",
	})
}

func TestClient_GetManagementToken_CachesBetweenCalls(t *testing.T) {
	var count atomic.Int64
	srv := fakeLogto(t, &count, 3600, nil)
	defer srv.Close()

	c := newTestClient(srv.URL)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		tok, err := c.GetManagementToken(ctx)
		require.NoError(t, err)
		require.NotEmpty(t, tok)
	}

	require.Equal(t, int64(1), count.Load(), "expected token to be minted once and reused")
}

func TestClient_GetManagementToken_RefreshesAfterExpiry(t *testing.T) {
	var count atomic.Int64
	// expires_in=1s with a 10s safety margin yields a cachedUntil in the
	// past, so the second call must refresh without any wall-clock wait.
	srv := fakeLogto(t, &count, 1, nil)
	defer srv.Close()

	c := newTestClient(srv.URL)
	ctx := context.Background()

	tok1, err := c.GetManagementToken(ctx)
	require.NoError(t, err)

	tok2, err := c.GetManagementToken(ctx)
	require.NoError(t, err)

	require.GreaterOrEqual(t, count.Load(), int64(2), "expected refresh after expiry")
	require.NotEqual(t, tok1, tok2, "refreshed token should differ from initial token")
}

func TestClient_GetUser_ReturnsAPIErrorOn404(t *testing.T) {
	var count atomic.Int64
	const errBody = `{"code":"user.not_found","message":"User not found"}`

	userHandler := func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/api/users/missing", r.URL.Path)
		require.Equal(t, "Bearer tok-1", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(errBody))
	}
	srv := fakeLogto(t, &count, 3600, userHandler)
	defer srv.Close()

	c := newTestClient(srv.URL)
	user, err := c.GetUser(context.Background(), "missing")
	require.Nil(t, user)
	require.Error(t, err)

	var apiErr *logto.APIError
	require.True(t, errors.As(err, &apiErr), "expected *logto.APIError, got %T: %v", err, err)
	require.Equal(t, http.StatusNotFound, apiErr.Status)
	require.Contains(t, apiErr.Body, "user.not_found")
	require.Contains(t, apiErr.Body, "User not found")
}
