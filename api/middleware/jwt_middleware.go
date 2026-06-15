// api/middleware/jwt_middleware.go
package middleware

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/court-command/court-command/auth"
)

// RequireJWT validates the Authorization Bearer token against the given
// validator on every request. On success, the parsed Claims are stored in
// the request context via auth.WithClaims. On any validation failure the
// middleware writes a 401 JSON error envelope and short-circuits the chain.
//
// orgScoped controls whether the validator accepts tokens whose audience
// is urn:logto:organization:* in addition to the global API resource
// audience. Use true for sport-scoped routes that consume Logto org tokens;
// use false for routes that should only accept the global API audience.
func RequireJWT(v *auth.Validator, orgScoped bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, ok := bearerToken(r.Header.Get("Authorization"))
			if !ok {
				writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
				return
			}

			claims, err := v.Validate(r.Context(), token, orgScoped)
			if err != nil {
				// Distinguish "Logto JWKS is unreachable" (infra failure ->
				// 503, log at error) from "client sent a bad token" (routine
				// -> 401, log at debug). Conflating these makes operators
				// chase JWT bugs while the real cause is networking.
				if errors.Is(err, auth.ErrJWKSUnavailable) {
					slog.ErrorContext(r.Context(), "jwks unavailable, cannot validate tokens", "err", err)
					writeError(w, http.StatusServiceUnavailable, "service_unavailable",
						"authentication temporarily unavailable")
					return
				}
				slog.DebugContext(r.Context(), "jwt validation failed", "err", err)
				writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
				return
			}

			ctx := auth.WithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// bearerToken extracts the token portion of a "Bearer <token>" Authorization
// header value. Returns ("", false) for any non-Bearer scheme, missing token,
// or otherwise malformed header so the caller can short-circuit with 401.
func bearerToken(header string) (string, bool) {
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}
	token := strings.TrimSpace(header[len(prefix):])
	if token == "" {
		return "", false
	}
	return token, true
}
