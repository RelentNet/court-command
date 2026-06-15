// api/handler/auth.go
package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	authService  *service.AuthService
	secureCookie bool
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authService *service.AuthService, secureCookie bool) *AuthHandler {
	return &AuthHandler{
		authService:  authService,
		secureCookie: secureCookie,
	}
}

// Register handles POST /api/v1/auth/register.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var input service.RegisterInput
	if errMsg := DecodeJSON(r, &input); errMsg != "" {
		BadRequest(w, errMsg)
		return
	}

	user, token, err := h.authService.Register(r.Context(), &input)
	if err != nil {
		var validationErr *service.ValidationError
		var conflictErr *service.ConflictError
		if errors.As(err, &validationErr) {
			BadRequest(w, validationErr.Message)
			return
		}
		if errors.As(err, &conflictErr) {
			Conflict(w, conflictErr.Message)
			return
		}
		InternalError(w, "registration failed")
		return
	}

	h.setSessionCookie(w, token)
	Created(w, user)
}

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var input service.LoginInput
	if errMsg := DecodeJSON(r, &input); errMsg != "" {
		BadRequest(w, errMsg)
		return
	}

	user, token, err := h.authService.Login(r.Context(), &input)
	if err != nil {
		var validationErr *service.ValidationError
		if errors.As(err, &validationErr) {
			BadRequest(w, validationErr.Message)
			return
		}
		InternalError(w, "login failed")
		return
	}

	h.setSessionCookie(w, token)
	Success(w, user)
}

// Logout handles POST /api/v1/auth/logout.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(session.SessionCookieName)
	if err != nil {
		NoContent(w)
		return
	}

	_ = h.authService.Logout(r.Context(), cookie.Value)

	http.SetCookie(w, &http.Cookie{
		Name:     session.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secureCookie,
		SameSite: http.SameSiteLaxMode,
	})

	NoContent(w)
}

// MeResponse wraps the user with optional impersonation metadata.
type MeResponse struct {
	*service.UserResponse
	Impersonation *ImpersonationInfo `json:"impersonation,omitempty"`
}

// ImpersonationInfo describes who is impersonating whom.
type ImpersonationInfo struct {
	Active         bool   `json:"active"`
	ImpersonatorID string `json:"impersonator_id"`
}

// Me handles GET /api/v1/auth/me.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	sessionData := session.SessionData(r.Context())
	if sessionData == nil {
		Unauthorized(w, "not authenticated")
		return
	}

	user, err := h.authService.GetCurrentUser(r.Context(), sessionData)
	if err != nil {
		var notFoundErr *service.NotFoundError
		if errors.As(err, &notFoundErr) {
			NotFound(w, notFoundErr.Message)
			return
		}
		InternalError(w, "failed to fetch user")
		return
	}

	resp := &MeResponse{UserResponse: user}

	if sessionData.IsImpersonating() {
		resp.Impersonation = &ImpersonationInfo{
			Active:         true,
			ImpersonatorID: sessionData.ImpersonatorPublicID,
		}
	}

	Success(w, resp)
}

// MeJWT handles GET /api/v1/auth/me when the request is JWT-authenticated
// (Phase 3+). Reads claims from context (set by RequireJWT), looks up
// the local users mirror row by Logto user ID, returns the same
// MeResponse shape as the legacy Me handler.
//
// Impersonation under JWT is detected from the token's `act` claim (RFC
// 8693): when an admin impersonates via OAuth 2.0 Token Exchange, the
// exchanged access token has sub=<target> and act.sub=<admin>. We surface
// that as MeResponse.Impersonation so the SPA renders the banner. The
// returned user IS the impersonated (target) user -- that's the whole point
// of impersonation; the impersonator's identity rides in the act claim.
func (h *AuthHandler) MeJWT(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		Unauthorized(w, "missing claims")
		return
	}
	user, err := h.authService.GetCurrentUserByLogtoSubject(r.Context(), claims.Subject)
	if err != nil {
		var notFoundErr *service.NotFoundError
		if errors.As(err, &notFoundErr) {
			NotFound(w, notFoundErr.Message)
			return
		}
		InternalError(w, "failed to fetch user")
		return
	}
	// Mirror the JWTSession bridge's role-elevation rule: the local DB
	// row holds the default 'player' role from CreateUserFromLogto, but
	// Logto's org-scoped token is the source of truth for platform_admin.
	// Without this, the SPA sees user.role='player' even though
	// handler-level checks (RequirePlatformAdmin) work fine -- and the
	// SPA hides admin nav, scoring/broadcast tools, etc. Phase 4+ webhook
	// will sync this back into the local DB on org-role changes; until
	// then we apply the in-flight elevation on every /auth/me read.
	if elevated := claims.ElevatedRole(); elevated != "" && elevated != user.Role {
		user.Role = elevated
	}

	resp := &MeResponse{UserResponse: user}

	// Impersonation signal: the act claim carries the impersonating admin's
	// Logto user ID. We expose it as ImpersonatorID so the SPA banner can
	// render. (We surface the raw Logto subject rather than a local public_id
	// to avoid an extra DB lookup on every /me; the SPA only needs a boolean
	// to render the banner today.)
	if claims.IsImpersonated() {
		resp.Impersonation = &ImpersonationInfo{
			Active:         true,
			ImpersonatorID: claims.ActorSubject,
		}
	}

	Success(w, resp)
}

// MyTournamentStaff handles GET /api/v1/auth/me/tournament-staff.
func (h *AuthHandler) MyTournamentStaff(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	assignment, err := h.authService.GetMyTournamentStaff(r.Context(), sess.UserID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, assignment)
}

// setSessionCookie writes the session token as an HTTP-only cookie.
func (h *AuthHandler) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     session.SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int((30 * 24 * time.Hour).Seconds()), // 30 days
		HttpOnly: true,
		Secure:   h.secureCookie,
		SameSite: http.SameSiteLaxMode,
	})
}
