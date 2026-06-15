// api/handler/profile.go
//
// ProfileHandler exposes the Phase 3 (Logto) /api/v1/me/profile endpoints.
// Both endpoints sit behind RequireJWT in the router; they read the
// validated Logto claims from the request context to identify the user.
// PATCH additionally requires the write:profile OAuth scope so a
// minimal-scope token (e.g. read-only client) cannot mutate profiles.
//
// The legacy cookie-session /api/v1/players/me endpoint owned by
// PlayerHandler stays untouched -- Phase 6 cutover deletes it once all
// frontend callers are migrated. Until then both endpoints coexist and
// read different storage (PlayerHandler => users table, this handler =>
// player_profiles table).
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/service"
)

// ProfileHandler binds the player_profiles service to the JWT-protected
// /me/profile routes. Construct via NewProfileHandler in main.go +
// testutil.TestServer; the zero value is unsafe.
type ProfileHandler struct {
	profileService *service.ProfileService
}

// NewProfileHandler returns a handler bound to the given ProfileService.
// The service owns both the row CRUD and the Logto-subject => users.id
// lookup; until Task 9's MirrorUser middleware lands the lookup happens
// per-request inside this handler.
func NewProfileHandler(p *service.ProfileService) *ProfileHandler {
	return &ProfileHandler{profileService: p}
}

// GetMyProfile returns the player_profiles row for the authenticated
// caller. When no row exists yet, ProfileService.Get returns an empty
// DTO with just user_id populated -- that's the contract the form's
// initial render relies on, so callers should treat all fields as
// optional and never expect a 404 here.
func (h *ProfileHandler) GetMyProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		// RequireJWT should always populate claims before we reach here.
		// Hitting this branch means the route was misconfigured (mounted
		// without the middleware) -- surface as 500 to make that obvious.
		WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "missing claims")
		return
	}
	userID, err := h.profileService.LookupUserByLogtoSubject(r.Context(), claims.Subject)
	if err != nil {
		HandleServiceError(w, err)
		return
	}
	profile, err := h.profileService.Get(r.Context(), userID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}
	Success(w, profile)
}

// PatchMyProfile applies a partial update to player_profiles for the
// authenticated caller. The DTO uses the COALESCE narg pattern: nil
// fields leave the existing column unchanged, so the frontend can
// safely send only the fields the user actually touched.
//
// Authorisation: requires the write:profile scope on the token in
// addition to a valid signature. A token without the scope returns
// 403 FORBIDDEN -- not 401 -- because the caller IS authenticated,
// they just lack permission for this action.
func (h *ProfileHandler) PatchMyProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "missing claims")
		return
	}
	if !claims.HasScope("write:profile") {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "missing write:profile scope")
		return
	}
	userID, err := h.profileService.LookupUserByLogtoSubject(r.Context(), claims.Subject)
	if err != nil {
		HandleServiceError(w, err)
		return
	}
	var in service.PlayerProfileDTO
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		WriteError(w, http.StatusBadRequest, "BAD_JSON", err.Error())
		return
	}
	saved, err := h.profileService.Upsert(r.Context(), userID, in)
	if err != nil {
		HandleServiceError(w, err)
		return
	}
	Success(w, saved)
}
