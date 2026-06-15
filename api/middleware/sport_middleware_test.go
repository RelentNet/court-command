// api/middleware/sport_middleware_test.go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/middleware"
	"github.com/stretchr/testify/require"
)

const (
	pickleballOrgID = "ekup1zyrrxj4"
	demoSportOrgID  = "7866ex96uk6b"
)

func newTestResolver() *middleware.SportResolver {
	return middleware.NewSportResolver(map[string]string{
		"pickleball": pickleballOrgID,
		"demo_sport": demoSportOrgID,
	})
}

// runSportMiddleware invokes mw against req and returns the recorder plus
// whether the downstream handler ran. ServeHTTP is synchronous so the
// returned bool is a stable read.
func runSportMiddleware(mw func(http.Handler) http.Handler, req *http.Request) (*httptest.ResponseRecorder, bool) {
	rr := httptest.NewRecorder()
	reached := false
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))
	h.ServeHTTP(rr, req)
	return rr, reached
}

func TestSportResolver_OrgID(t *testing.T) {
	src := map[string]string{
		"pickleball": pickleballOrgID,
		"demo_sport": demoSportOrgID,
	}
	r := middleware.NewSportResolver(src)

	cases := []struct {
		slug string
		want string
	}{
		{"pickleball", pickleballOrgID},
		{"demo_sport", demoSportOrgID},
		{"", ""},
		{"chess", ""},
	}
	for _, tc := range cases {
		t.Run("slug="+tc.slug, func(t *testing.T) {
			require.Equal(t, tc.want, r.OrgID(tc.slug))
		})
	}

	// Mutating the caller's map after construction must not affect the
	// resolver -- proves NewSportResolver copied the map.
	src["pickleball"] = "tampered"
	delete(src, "demo_sport")
	require.Equal(t, pickleballOrgID, r.OrgID("pickleball"),
		"resolver must be insulated from caller-side mutation")
	require.Equal(t, demoSportOrgID, r.OrgID("demo_sport"),
		"resolver must be insulated from caller-side deletion")
}

func TestRequireSportMatchesJWT_Match_Passes(t *testing.T) {
	mw := middleware.RequireSportMatchesJWT(newTestResolver())

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Sport", "pickleball")
	req = req.WithContext(auth.WithClaims(req.Context(), auth.Claims{
		Subject:        "user_abc",
		OrganizationID: pickleballOrgID,
	}))

	rr, reached := runSportMiddleware(mw, req)

	require.True(t, reached, "handler should be reached when sport matches")
	require.Equal(t, http.StatusOK, rr.Code)
}

func TestRequireSportMatchesJWT_HeaderMissing_Returns400(t *testing.T) {
	mw := middleware.RequireSportMatchesJWT(newTestResolver())

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req = req.WithContext(auth.WithClaims(req.Context(), auth.Claims{
		OrganizationID: pickleballOrgID,
	}))

	rr, reached := runSportMiddleware(mw, req)

	require.False(t, reached, "handler must not be reached without X-Sport header")
	require.Equal(t, http.StatusBadRequest, rr.Code)
	require.Contains(t, rr.Body.String(), "missing X-Sport")
}

func TestRequireSportMatchesJWT_UnknownSport_Returns400(t *testing.T) {
	mw := middleware.RequireSportMatchesJWT(newTestResolver())

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Sport", "chess")
	req = req.WithContext(auth.WithClaims(req.Context(), auth.Claims{
		OrganizationID: pickleballOrgID,
	}))

	rr, reached := runSportMiddleware(mw, req)

	require.False(t, reached)
	require.Equal(t, http.StatusBadRequest, rr.Code)
	require.Contains(t, rr.Body.String(), "unknown sport")
	require.Contains(t, rr.Body.String(), "chess")
}

func TestRequireSportMatchesJWT_MismatchedOrgID_Returns403(t *testing.T) {
	mw := middleware.RequireSportMatchesJWT(newTestResolver())

	// Header says pickleball, JWT carries demo_sport's org ID.
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Sport", "pickleball")
	req = req.WithContext(auth.WithClaims(req.Context(), auth.Claims{
		OrganizationID: demoSportOrgID,
	}))

	rr, reached := runSportMiddleware(mw, req)

	require.False(t, reached)
	require.Equal(t, http.StatusForbidden, rr.Code)
	require.Contains(t, rr.Body.String(), "sport does not match")
}

func TestRequireSportMatchesJWT_NoClaimsInContext_Returns500(t *testing.T) {
	mw := middleware.RequireSportMatchesJWT(newTestResolver())

	// Programmer-error scenario: RequireJWT was not chained, so claims
	// are absent from the request context. Middleware must fail closed.
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("X-Sport", "pickleball")

	rr, reached := runSportMiddleware(mw, req)

	require.False(t, reached, "handler must not be reached without claims")
	require.Equal(t, http.StatusInternalServerError, rr.Code)
	require.Contains(t, rr.Body.String(), "internal_error")
	require.Contains(t, rr.Body.String(), "server configuration error",
		"message must reflect the actual condition (programmer error), not contradict the 500 status")
}
