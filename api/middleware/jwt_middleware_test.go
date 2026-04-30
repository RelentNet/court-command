// api/middleware/jwt_middleware_test.go
package middleware_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/middleware"
	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"
	"github.com/stretchr/testify/require"
)

const (
	testIssuer    = "https://test.logto.app/"
	testAPIaud    = "https://api.courtcommand.app/api"
	testKID       = "test-key-1"
	testOrgURNAud = "urn:logto:organization:org_pickleball"
)

// testKey returns (privateKey, jwksServerURL) where the JWKS server serves
// the public counterpart of priv as a single-entry JWK Set with kid=testKID
// and alg=RS256. Caller is responsible for calling t.Cleanup-equivalent;
// httptest.Server is registered with t.Cleanup here.
func testKey(t *testing.T) (*rsa.PrivateKey, string) {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	jwksURL := serveJWKS(t, &priv.PublicKey, testKID)
	return priv, jwksURL
}

// serveJWKS spins up an httptest.Server that returns a JWK Set containing
// the single public key under kid. The server is torn down via t.Cleanup.
func serveJWKS(t *testing.T, pub *rsa.PublicKey, kid string) string {
	t.Helper()
	pubJWK, err := jwk.Import(pub)
	require.NoError(t, err)
	require.NoError(t, pubJWK.Set(jwk.KeyIDKey, kid))
	require.NoError(t, pubJWK.Set(jwk.AlgorithmKey, jwa.RS256()))

	set := jwk.NewSet()
	require.NoError(t, set.AddKey(pubJWK))
	body, err := json.Marshal(set)
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

// mintToken signs a JWT with priv and returns the compact-serialized form.
// Defaults: iss=testIssuer, iat=now, exp=now+5m. Caller-supplied claims
// override the defaults; pass time.Time values for exp/iat.
func mintToken(t *testing.T, priv *rsa.PrivateKey, claims map[string]interface{}) string {
	t.Helper()
	tok := jwt.New()

	if _, ok := claims[jwt.IssuerKey]; !ok {
		require.NoError(t, tok.Set(jwt.IssuerKey, testIssuer))
	}
	if _, ok := claims[jwt.IssuedAtKey]; !ok {
		require.NoError(t, tok.Set(jwt.IssuedAtKey, time.Now()))
	}
	if _, ok := claims[jwt.ExpirationKey]; !ok {
		require.NoError(t, tok.Set(jwt.ExpirationKey, time.Now().Add(5*time.Minute)))
	}
	for k, v := range claims {
		require.NoError(t, tok.Set(k, v))
	}

	privJWK, err := jwk.Import(priv)
	require.NoError(t, err)
	require.NoError(t, privJWK.Set(jwk.KeyIDKey, testKID))
	require.NoError(t, privJWK.Set(jwk.AlgorithmKey, jwa.RS256()))

	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.RS256(), privJWK))
	require.NoError(t, err)
	return string(signed)
}

// runMiddleware wires the middleware around a handler that records whether it
// was reached and returns the recorder + handler-reached flag pointer.
func runMiddleware(mw func(http.Handler) http.Handler, req *http.Request) (*httptest.ResponseRecorder, *bool, *http.Request) {
	reached := false
	var capturedReq *http.Request
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		capturedReq = r
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr, &reached, capturedReq
}

func TestRequireJWT_ValidToken_PassesThroughWithClaims(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	token := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:       "user_abc",
		jwt.AudienceKey:      []string{testOrgURNAud},
		"organization_id":    "org_pickleball",
		"organization_roles": []string{"platform_admin"},
		"scope":              "read:tournaments write:tournaments",
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	rr, reached, capturedReq := runMiddleware(mw, req)

	require.True(t, *reached, "downstream handler should be reached on valid token")
	require.Equal(t, http.StatusOK, rr.Code)

	claims, ok := auth.ClaimsFromContext(capturedReq.Context())
	require.True(t, ok, "claims should be present in handler context")
	require.Equal(t, "user_abc", claims.Subject)
	require.Equal(t, "org_pickleball", claims.OrganizationID)
	require.Equal(t, []string{"platform_admin"}, claims.OrganizationRoles)
	require.ElementsMatch(t, []string{"read:tournaments", "write:tournaments"}, claims.Scopes)
	require.Equal(t, []string{testOrgURNAud}, claims.Audience)
}

// RFC 6750 §2.1: the auth scheme is case-insensitive. The middleware uses
// strings.EqualFold; this test guards against a future regression to
// strings.HasPrefix that would silently break case-insensitive callers.
func TestRequireJWT_ValidToken_LowercaseScheme_Accepted(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	token := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "user_abc",
		jwt.AudienceKey: []string{testAPIaud},
	})

	for _, scheme := range []string{"Bearer", "bearer", "BEARER", "BeArEr"} {
		t.Run(scheme, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/x", nil)
			req.Header.Set("Authorization", scheme+" "+token)
			rr, reached, _ := runMiddleware(mw, req)

			require.True(t, *reached, "valid token with %q scheme must reach handler", scheme)
			require.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

func TestRequireJWT_MissingHeader_Returns401(t *testing.T) {
	_, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached, "handler must not be reached without auth header")
	require.Equal(t, http.StatusUnauthorized, rr.Code)
	require.Contains(t, rr.Body.String(), "unauthorized")
}

func TestRequireJWT_MalformedAuthHeader_Returns401(t *testing.T) {
	_, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	cases := []struct {
		name   string
		header string
	}{
		{"bearer no token", "Bearer"},
		{"bearer empty token", "Bearer "},
		{"wrong scheme", "Basic xxx"},
		{"no scheme", "xxx"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/x", nil)
			req.Header.Set("Authorization", tc.header)

			rr, reached, _ := runMiddleware(mw, req)

			require.False(t, *reached)
			require.Equal(t, http.StatusUnauthorized, rr.Code)
			require.Contains(t, rr.Body.String(), "unauthorized")
		})
	}
}

func TestRequireJWT_WrongIssuer_Returns401(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	token := mintToken(t, priv, map[string]interface{}{
		jwt.IssuerKey:   "https://attacker.example/",
		jwt.SubjectKey:  "user_abc",
		jwt.AudienceKey: []string{testOrgURNAud},
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached)
	require.Equal(t, http.StatusUnauthorized, rr.Code)
	require.Contains(t, rr.Body.String(), "invalid token")
}

func TestRequireJWT_WrongAudience_Returns401(t *testing.T) {
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	token := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "user_abc",
		jwt.AudienceKey: []string{"https://random.example/whatever"},
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached)
	require.Equal(t, http.StatusUnauthorized, rr.Code)
	require.Contains(t, rr.Body.String(), "invalid token")
}

func TestRequireJWT_BadSignature_Returns401(t *testing.T) {
	// JWKS server publishes pub of key1 only. We sign the token with key2.
	// Validator must reject because the signature won't verify against any
	// key in the published set. Security-critical: a forged token signed by
	// any RSA key MUST NOT be accepted.
	_, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	priv2, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	token := mintToken(t, priv2, map[string]interface{}{
		jwt.SubjectKey:  "user_abc",
		jwt.AudienceKey: []string{testOrgURNAud},
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached, "forged-signature token must not reach handler")
	require.Equal(t, http.StatusUnauthorized, rr.Code)
	require.Contains(t, rr.Body.String(), "invalid token")
}

func TestRequireJWT_ExpiredToken_Returns401(t *testing.T) {
	// Verifies the I-1 deferred check: jwt.WithValidate (default in v3
	// jwt.Parse) DOES reject tokens whose exp claim is in the past. The
	// token is otherwise valid -- correct signer, issuer, and audience --
	// so the only reason for rejection is expiry.
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	expiredAt := time.Now().Add(-1 * time.Hour)
	token := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:    "user_abc",
		jwt.AudienceKey:   []string{testOrgURNAud},
		jwt.IssuedAtKey:   time.Now().Add(-2 * time.Hour),
		jwt.ExpirationKey: expiredAt,
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached, "expired token must not reach handler -- I-1 verification")
	require.Equal(t, http.StatusUnauthorized, rr.Code)
	require.Contains(t, rr.Body.String(), "invalid token")
	require.True(t, expiredAt.Before(time.Now()), "test pre-condition: exp must be in the past")
}

func TestRequireJWT_OrgScopedFalse_RejectsOrgURN(t *testing.T) {
	// orgScoped=false: the org-URN audience must be rejected even though
	// the token is otherwise perfectly valid.
	priv, jwksURL := testKey(t)
	v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
	mw := middleware.RequireJWT(v, false)

	token := mintToken(t, priv, map[string]interface{}{
		jwt.SubjectKey:  "user_abc",
		jwt.AudienceKey: []string{testOrgURNAud},
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached)
	require.Equal(t, http.StatusUnauthorized, rr.Code)
	require.Contains(t, rr.Body.String(), "invalid token")
}

func TestRequireJWT_GlobalAudienceAccepted(t *testing.T) {
	// Global API audience matches exactly: must pass regardless of the
	// orgScoped flag's value. Run both to prove the policy.
	priv, jwksURL := testKey(t)

	for _, orgScoped := range []bool{true, false} {
		t.Run(fmt.Sprintf("orgScoped=%t", orgScoped), func(t *testing.T) {
			v := auth.NewValidator(testIssuer, jwksURL, testAPIaud)
			mw := middleware.RequireJWT(v, orgScoped)

			token := mintToken(t, priv, map[string]interface{}{
				jwt.SubjectKey:  "user_abc",
				jwt.AudienceKey: []string{testAPIaud},
			})

			req := httptest.NewRequest(http.MethodGet, "/x", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rr, reached, _ := runMiddleware(mw, req)

			require.True(t, *reached, "handler must be reached for global-aud token")
			require.Equal(t, http.StatusOK, rr.Code)
		})
	}
}

// TestRequireJWT_JWKSUnavailable_Returns503 verifies that an infrastructure
// failure (Logto JWKS unreachable on cold start, no cached keys) surfaces
// as 503 service_unavailable, NOT 401 invalid_token. The old behavior
// confused operators chasing JWT bugs while the real cause was networking.
func TestRequireJWT_JWKSUnavailable_Returns503(t *testing.T) {
	// Validator pointed at a TCP black hole. The httptest server is
	// created and immediately closed so its port refuses connections.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	deadJWKSURL := srv.URL
	srv.Close()

	v := auth.NewValidator(testIssuer, deadJWKSURL, testAPIaud)
	mw := middleware.RequireJWT(v, true)

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer some.token.here")

	rr, reached, _ := runMiddleware(mw, req)

	require.False(t, *reached, "handler must not be reached on JWKS failure")
	require.Equal(t, http.StatusServiceUnavailable, rr.Code,
		"JWKS-unreachable must surface as 503, not 401")
	require.Contains(t, rr.Body.String(), "service_unavailable")
}

