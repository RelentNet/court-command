// api/middleware/auth.go
package middleware

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/court-command/court-command/session"
)

// SessionData returns the session data from the request context, or nil if not authenticated.
// This is a convenience wrapper around session.SessionData.
func SessionData(ctx context.Context) *session.Data {
	return session.SessionData(ctx)
}

// OptionalAuth is a middleware that populates session data when a valid cookie exists
// but never rejects the request. Use this on mixed-auth routes where reads are public
// but writes check auth at the handler level.
func OptionalAuth(store *session.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(session.SessionCookieName)
			if err == nil && cookie.Value != "" {
				data, err := store.Get(r.Context(), cookie.Value)
				if err == nil && data != nil {
					ctx := session.SetSessionData(r.Context(), data)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAuth is a middleware that requires a valid session cookie.
// If the session is invalid or missing, it returns 401 Unauthorized.
func RequireAuth(store *session.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(session.SessionCookieName)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
				return
			}

			data, err := store.Get(r.Context(), cookie.Value)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "internal_error", "session lookup failed")
				return
			}
			if data == nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "session expired or invalid")
				return
			}

			ctx := session.SetSessionData(r.Context(), data)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns a middleware that checks the authenticated user has one of the allowed roles.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	roleSet := make(map[string]bool, len(roles))
	for _, r := range roles {
		roleSet[r] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			data := SessionData(r.Context())
			if data == nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
				return
			}

			if !roleSet[data.Role] {
				writeError(w, http.StatusForbidden, "forbidden", "insufficient permissions")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequirePlatformAdmin is middleware that requires the user to be a platform admin.
//
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// TEMP-ADMIN-BYPASS: the platform_admin role check is currently DISABLED while
// we debug the Logto organization_roles claim plumbing. Any authenticated user
// gets through this middleware. Every admin endpoint mounted under this
// middleware in router.go (around line 496) is therefore reachable by ANY
// signed-in account -- including users who self-registered via Logto's public
// sign-up flow on courtcommand.app.
//
// To restore the role check: delete the early `return next.ServeHTTP(...)`
// below and remove this comment block. To find every related bypass site:
//   git grep TEMP-ADMIN-BYPASS
// Sites bypassed in this commit:
//   - api/middleware/auth.go (this function)
//   - web/src/features/admin/AdminGuard.tsx
//   - web/src/components/Sidebar.tsx (admin link visibility)
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
func RequirePlatformAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data := SessionData(r.Context())
		if data == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		// TEMP-ADMIN-BYPASS: role check disabled. Any authenticated user passes.
		// Original gate, to restore: uncomment and delete the bypass line above.
		//
		// if data.Role != "platform_admin" {
		//     writeError(w, http.StatusForbidden, "forbidden", "platform admin required")
		//     return
		// }
		next.ServeHTTP(w, r)
	})
}

// writeError writes a structured JSON error response.
// This is a local helper to avoid importing the handler package (which would create a cycle).
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	})
}
