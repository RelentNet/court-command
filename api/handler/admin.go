// api/handler/admin.go
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/auth"
	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/logto"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
)

// AdminHandler handles platform admin endpoints.
type AdminHandler struct {
	queries        *generated.Queries
	activityLogSvc *service.ActivityLogService
	apiKeySvc      *service.ApiKeyService
	sessionStore   *session.Store
	uploadSvc      *service.UploadService
	// logtoClient mints subject tokens for the Logto-native impersonation
	// flow (OAuth 2.0 Token Exchange). May be nil in cookie-only / testutil
	// environments without Logto Management API creds; the impersonate
	// endpoint returns 503 in that case.
	logtoClient *logto.Client
}

// NewAdminHandler creates a new AdminHandler. logtoClient may be nil in
// environments without Logto Management API creds (testutil, dev-without-Logto);
// the JWT impersonation endpoint requires it and 503s when absent.
func NewAdminHandler(
	queries *generated.Queries,
	activityLogSvc *service.ActivityLogService,
	apiKeySvc *service.ApiKeyService,
	sessionStore *session.Store,
	uploadSvc *service.UploadService,
	logtoClient *logto.Client,
) *AdminHandler {
	return &AdminHandler{
		queries:        queries,
		activityLogSvc: activityLogSvc,
		apiKeySvc:      apiKeySvc,
		sessionStore:   sessionStore,
		uploadSvc:      uploadSvc,
		logtoClient:    logtoClient,
	}
}

// Routes returns a chi.Router with all admin routes mounted.
func (h *AdminHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// User management
	r.Get("/users", h.SearchUsers)
	r.Post("/users/create-player", h.CreateUnclaimedPlayer)
	r.Get("/users/{userID}", h.GetUser)
	r.Patch("/users/{userID}/role", h.UpdateUserRole)
	r.Patch("/users/{userID}/status", h.UpdateUserStatus)
	// Logto-native impersonation: mint a subject token the SPA exchanges at
	// Logto's /oidc/token. Mounted under the admin group (platform_admin only).
	r.Post("/users/{userID}/impersonate", h.ImpersonateUser)

	// Venue management
	r.Get("/venues/pending", h.ListPendingVenues)
	r.Patch("/venues/{venueID}/status", h.UpdateVenueStatus)

	// System stats
	r.Get("/stats", h.GetSystemStats)

	// Activity logs
	r.Get("/activity-logs", h.ListActivityLogs)

	// API keys (admin can manage their own keys)
	r.Get("/api-keys", h.ListApiKeys)
	r.Post("/api-keys", h.CreateApiKey)
	r.Delete("/api-keys/{keyID}", h.RevokeApiKey)

	// Impersonation: Logto-native start endpoint is /users/{userID}/impersonate
	// above. Stop is registered outside the admin group in router.go (the
	// impersonated token is not platform_admin). The legacy cookie-path
	// StartImpersonation handler/route is intentionally NOT mounted anymore —
	// it was dead under JWT auth. See StartImpersonation's deprecation note;
	// the handler is retained only until Phase 6 deletes the cookie store.

	// Upload cleanup
	r.Post("/uploads/cleanup", h.CleanOrphanedUploads)

	return r
}

// --- Admin user response DTO ---

type adminUserResponse struct {
	ID          int64   `json:"id"`
	PublicID    string  `json:"public_id"`
	Email       *string `json:"email"`
	FirstName   string  `json:"first_name"`
	LastName    string  `json:"last_name"`
	DisplayName *string `json:"display_name,omitempty"`
	Status      string  `json:"status"`
	Role        string  `json:"role"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func toAdminUserResponse(u generated.User) adminUserResponse {
	return adminUserResponse{
		ID:          u.ID,
		PublicID:    u.PublicID,
		Email:       u.Email,
		FirstName:   u.FirstName,
		LastName:    u.LastName,
		DisplayName: u.DisplayName,
		Status:      u.Status,
		Role:        u.Role,
		CreatedAt:   u.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   u.UpdatedAt.Format(time.RFC3339),
	}
}

// --- User Management ---

// SearchUsers handles GET /api/v1/admin/users?q=&role=&status=&limit=&offset=
func (h *AdminHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	limit, offset := parsePagination(r)

	q := r.URL.Query().Get("q")
	role := r.URL.Query().Get("role")
	status := r.URL.Query().Get("status")

	var qPtr, rolePtr, statusPtr *string
	if q != "" {
		qPtr = &q
	}
	if role != "" {
		rolePtr = &role
	}
	if status != "" {
		statusPtr = &status
	}

	users, err := h.queries.SearchUsers(r.Context(), generated.SearchUsersParams{
		Limit:  limit,
		Offset: offset,
		Query:  qPtr,
		Role:   rolePtr,
		Status: statusPtr,
	})
	if err != nil {
		InternalError(w, "failed to search users")
		return
	}

	total, err := h.queries.CountSearchUsers(r.Context(), generated.CountSearchUsersParams{
		Query:  qPtr,
		Role:   rolePtr,
		Status: statusPtr,
	})
	if err != nil {
		InternalError(w, "failed to count users")
		return
	}

	result := make([]adminUserResponse, len(users))
	for i, u := range users {
		result[i] = toAdminUserResponse(u)
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "admin_search_users", "user", nil, map[string]string{"query": q}, r.RemoteAddr)

	Paginated(w, result, total, int(limit), int(offset))
}

// resolveUserParam resolves a URL parameter to a user — accepts numeric ID or public_id (e.g. "CC-10295").
func (h *AdminHandler) resolveUserParam(w http.ResponseWriter, r *http.Request) (generated.User, bool) {
	param := chi.URLParam(r, "userID")

	// Try numeric ID first
	if userID, err := strconv.ParseInt(param, 10, 64); err == nil {
		user, err := h.queries.GetUserByID(r.Context(), userID)
		if err != nil {
			NotFound(w, "user not found")
			return generated.User{}, false
		}
		return user, true
	}

	// Fall back to public_id lookup
	user, err := h.queries.GetUserByPublicID(r.Context(), param)
	if err != nil {
		NotFound(w, "user not found")
		return generated.User{}, false
	}
	return user, true
}

// GetUser handles GET /api/v1/admin/users/{userID}
func (h *AdminHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	user, ok := h.resolveUserParam(w, r)
	if !ok {
		return
	}
	Success(w, toAdminUserResponse(user))
}

// UpdateUserRole handles PATCH /api/v1/admin/users/{userID}/role
func (h *AdminHandler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	target, ok := h.resolveUserParam(w, r)
	if !ok {
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if errMsg := DecodeJSON(r, &body); errMsg != "" {
		BadRequest(w, errMsg)
		return
	}

	// Values MUST match CHECK constraint in api/db/migrations/00030_expand_user_roles.sql
	validRoles := map[string]bool{
		"player": true, "platform_admin": true, "tournament_director": true,
		"head_referee": true, "referee": true, "scorekeeper": true,
		"broadcast_operator": true, "league_admin": true, "organization_admin": true,
		"team_coach": true, "api_readonly": true,
	}
	if !validRoles[body.Role] {
		BadRequest(w, "invalid role")
		return
	}

	user, err := h.queries.UpdateUserRole(r.Context(), generated.UpdateUserRoleParams{
		ID:   target.ID,
		Role: body.Role,
	})
	if err != nil {
		InternalError(w, "failed to update user role")
		return
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "admin_update_user_role", "user", &target.ID, map[string]string{"new_role": body.Role}, r.RemoteAddr)

	Success(w, toAdminUserResponse(user))
}

// UpdateUserStatus handles PATCH /api/v1/admin/users/{userID}/status
func (h *AdminHandler) UpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	target, ok := h.resolveUserParam(w, r)
	if !ok {
		return
	}

	var body struct {
		Status string  `json:"status"`
		Reason *string `json:"reason"`
	}
	if errMsg := DecodeJSON(r, &body); errMsg != "" {
		BadRequest(w, errMsg)
		return
	}

	validStatuses := map[string]bool{"active": true, "suspended": true, "banned": true}
	if !validStatuses[body.Status] {
		BadRequest(w, "invalid status; must be 'active', 'suspended', or 'banned'")
		return
	}

	user, err := h.queries.UpdateUserStatus(r.Context(), generated.UpdateUserStatusParams{
		ID:     target.ID,
		Status: body.Status,
	})
	if err != nil {
		InternalError(w, "failed to update user status")
		return
	}

	// If suspending or banning, revoke all sessions
	if body.Status == "suspended" || body.Status == "banned" {
		_ = h.sessionStore.DeleteAllForUser(r.Context(), target.ID)
	}

	activityMeta := map[string]string{"new_status": body.Status}
	if body.Reason != nil && *body.Reason != "" {
		activityMeta["reason"] = *body.Reason
	}
	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "admin_update_user_status", "user", &target.ID, activityMeta, r.RemoteAddr)

	Success(w, toAdminUserResponse(user))
}

// --- Venue Management ---

// pendingVenueResponse is the DTO for the admin venue approval queue.
// It enriches the base venue row with owner_email and court_count so the
// admin UI can render each card without extra round-trips.
type pendingVenueResponse struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	Slug             string  `json:"slug"`
	Status           string  `json:"status"`
	City             *string `json:"city"`
	StateProvince    *string `json:"state_province"`
	Country          *string `json:"country"`
	FormattedAddress *string `json:"formatted_address"`
	OwnerID          int64   `json:"owner_id"`
	OwnerEmail       *string `json:"owner_email"`
	CourtCount       int64   `json:"court_count"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

// ListPendingVenues handles GET /api/v1/admin/venues/pending
func (h *AdminHandler) ListPendingVenues(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r)

	venues, err := h.queries.ListPendingVenues(r.Context(), generated.ListPendingVenuesParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		InternalError(w, "failed to list pending venues")
		return
	}

	total, err := h.queries.CountPendingVenues(r.Context())
	if err != nil {
		InternalError(w, "failed to count pending venues")
		return
	}

	// Enrich each venue with owner email + court count. The pending queue is
	// small (admin-only, typically <20 rows per page) so N+1 lookups are fine.
	items := make([]pendingVenueResponse, len(venues))
	for i, v := range venues {
		courtCount, cErr := h.queries.GetVenueCourtCount(r.Context(), pgtype.Int8{Int64: v.ID, Valid: true})
		if cErr != nil {
			// Log but don't fail the list — default to 0.
			courtCount = 0
		}

		var ownerEmail *string
		if owner, oErr := h.queries.GetUserByID(r.Context(), v.CreatedByUserID); oErr == nil {
			ownerEmail = owner.Email
		}

		items[i] = pendingVenueResponse{
			ID:               v.ID,
			Name:             v.Name,
			Slug:             v.Slug,
			Status:           v.Status,
			City:             v.City,
			StateProvince:    v.StateProvince,
			Country:          v.Country,
			FormattedAddress: v.FormattedAddress,
			OwnerID:          v.CreatedByUserID,
			OwnerEmail:       ownerEmail,
			CourtCount:       courtCount,
			CreatedAt:        v.CreatedAt.Format(time.RFC3339),
			UpdatedAt:        v.UpdatedAt.Format(time.RFC3339),
		}
	}

	Paginated(w, items, total, int(limit), int(offset))
}

// UpdateVenueStatus handles PATCH /api/v1/admin/venues/{venueID}/status
func (h *AdminHandler) UpdateVenueStatus(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	venueID, err := strconv.ParseInt(chi.URLParam(r, "venueID"), 10, 64)
	if err != nil {
		BadRequest(w, "invalid venue ID")
		return
	}

	var body struct {
		Status   string  `json:"status"`
		Feedback *string `json:"feedback"`
	}
	if errMsg := DecodeJSON(r, &body); errMsg != "" {
		BadRequest(w, errMsg)
		return
	}

	// Values MUST match CHECK constraint in api/db/migrations/00005_create_venues.sql
	validStatuses := map[string]bool{"draft": true, "pending_review": true, "published": true, "archived": true}
	if !validStatuses[body.Status] {
		BadRequest(w, "invalid status; must be 'draft', 'pending_review', 'published', or 'archived'")
		return
	}

	venue, err := h.queries.UpdateVenueStatus(r.Context(), generated.UpdateVenueStatusParams{
		ID:     venueID,
		Status: body.Status,
	})
	if err != nil {
		InternalError(w, "failed to update venue status")
		return
	}

	activityMeta := map[string]string{"new_status": body.Status}
	if body.Feedback != nil && *body.Feedback != "" {
		activityMeta["feedback"] = *body.Feedback
	}
	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "admin_update_venue_status", "venue", &venue.ID, activityMeta, r.RemoteAddr)

	Success(w, venue)
}

// --- System Stats ---

// GetSystemStats handles GET /api/v1/admin/stats
func (h *AdminHandler) GetSystemStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	users, err := h.queries.CountUsers(ctx)
	if err != nil {
		InternalError(w, "failed to count users")
		return
	}

	tournaments, err := h.queries.CountTournaments(ctx)
	if err != nil {
		InternalError(w, "failed to count tournaments")
		return
	}

	leagues, err := h.queries.CountLeagues(ctx)
	if err != nil {
		InternalError(w, "failed to count leagues")
		return
	}

	matches, err := h.queries.CountMatches(ctx)
	if err != nil {
		InternalError(w, "failed to count matches")
		return
	}

	var noStatusFilter *string
	venues, err := h.queries.CountVenues(ctx, noStatusFilter)
	if err != nil {
		InternalError(w, "failed to count venues")
		return
	}

	courts, err := h.queries.CountCourts(ctx)
	if err != nil {
		InternalError(w, "failed to count courts")
		return
	}

	teams, err := h.queries.CountTeams(ctx)
	if err != nil {
		InternalError(w, "failed to count teams")
		return
	}

	orgs, err := h.queries.CountOrgs(ctx)
	if err != nil {
		InternalError(w, "failed to count organizations")
		return
	}

	// Count pending venues
	pendingStatus := "pending_review"
	pendingVenues, err := h.queries.CountVenues(ctx, &pendingStatus)
	if err != nil {
		pendingVenues = 0
	}

	// Count active matches
	activeMatches, err := h.queries.CountMatchesByStatus(ctx, "in_progress")
	if err != nil {
		activeMatches = 0
	}

	Success(w, map[string]int64{
		"total_users":         users,
		"total_tournaments":   tournaments,
		"total_leagues":       leagues,
		"total_matches":       matches,
		"total_venues":        venues,
		"total_courts":        courts,
		"total_teams":         teams,
		"total_organizations": orgs,
		"pending_venues":      pendingVenues,
		"active_matches":      activeMatches,
	})
}

// --- Activity Logs ---

// ListActivityLogs handles GET /api/v1/admin/activity-logs
func (h *AdminHandler) ListActivityLogs(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r)

	var userIDPtr *int64
	if uid := r.URL.Query().Get("user_id"); uid != "" {
		parsed, err := strconv.ParseInt(uid, 10, 64)
		if err != nil {
			BadRequest(w, "invalid user_id")
			return
		}
		userIDPtr = &parsed
	}

	action := r.URL.Query().Get("action")
	entityType := r.URL.Query().Get("entity_type")

	var actionPtr, entityTypePtr *string
	if action != "" {
		actionPtr = &action
	}
	if entityType != "" {
		entityTypePtr = &entityType
	}

	logs, total, err := h.activityLogSvc.ListActivityLogs(r.Context(), userIDPtr, actionPtr, entityTypePtr, limit, offset)
	if err != nil {
		InternalError(w, "failed to list activity logs")
		return
	}

	Paginated(w, logs, total, int(limit), int(offset))
}

// --- API Keys ---

// ListApiKeys handles GET /api/v1/admin/api-keys
func (h *AdminHandler) ListApiKeys(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	keys, err := h.apiKeySvc.ListApiKeys(r.Context(), sess.UserID)
	if err != nil {
		InternalError(w, "failed to list api keys")
		return
	}

	Success(w, keys)
}

// CreateApiKey handles POST /api/v1/admin/api-keys
func (h *AdminHandler) CreateApiKey(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	var body struct {
		Name      string   `json:"name"`
		Scopes    []string `json:"scopes"`
		ExpiresAt *string  `json:"expires_at"` // ISO date (YYYY-MM-DD) or RFC3339 timestamp
	}
	if errMsg := DecodeJSON(r, &body); errMsg != "" {
		BadRequest(w, errMsg)
		return
	}

	var expiresAt *time.Time
	if body.ExpiresAt != nil && *body.ExpiresAt != "" {
		// Accept either a calendar date (YYYY-MM-DD) or a full RFC3339 timestamp.
		// Calendar dates are interpreted as end-of-day UTC (23:59:59 UTC).
		var t time.Time
		var err error
		if len(*body.ExpiresAt) == 10 {
			t, err = time.Parse("2006-01-02", *body.ExpiresAt)
			if err == nil {
				t = t.Add(24*time.Hour - time.Second) // end of day
			}
		} else {
			t, err = time.Parse(time.RFC3339, *body.ExpiresAt)
		}
		if err != nil {
			BadRequest(w, "invalid expires_at; expected YYYY-MM-DD or RFC3339 timestamp")
			return
		}
		expiresAt = &t
	}

	result, err := h.apiKeySvc.CreateApiKey(r.Context(), sess.UserID, body.Name, body.Scopes, expiresAt)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "create_api_key", "api_key", nil, map[string]string{"name": body.Name}, r.RemoteAddr)

	Created(w, result)
}

// RevokeApiKey handles DELETE /api/v1/admin/api-keys/{keyID}
func (h *AdminHandler) RevokeApiKey(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	keyID, err := strconv.ParseInt(chi.URLParam(r, "keyID"), 10, 64)
	if err != nil {
		BadRequest(w, "invalid key ID")
		return
	}

	if err := h.apiKeySvc.RevokeApiKey(r.Context(), keyID, sess.UserID); err != nil {
		InternalError(w, "failed to revoke api key")
		return
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "revoke_api_key", "api_key", &keyID, nil, r.RemoteAddr)

	NoContent(w)
}

// CreateUnclaimedPlayer creates a placeholder player account that can be claimed later.
func (h *AdminHandler) CreateUnclaimedPlayer(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "Not authenticated")
		return
	}

	var body struct {
		FirstName   string `json:"first_name"`
		LastName    string `json:"last_name"`
		DateOfBirth string `json:"date_of_birth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		BadRequest(w, "Invalid request body")
		return
	}

	if body.FirstName == "" || body.LastName == "" || body.DateOfBirth == "" {
		BadRequest(w, "first_name, last_name, and date_of_birth are required")
		return
	}

	dob, err := time.Parse("2006-01-02", body.DateOfBirth)
	if err != nil {
		BadRequest(w, "date_of_birth must be YYYY-MM-DD format")
		return
	}

	user, err := h.queries.CreateUnclaimedUser(r.Context(), generated.CreateUnclaimedUserParams{
		FirstName:   body.FirstName,
		LastName:    body.LastName,
		DateOfBirth: dob,
	})
	if err != nil {
		InternalError(w, "Failed to create player")
		return
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "create_unclaimed_player", "user", &user.ID, nil, r.RemoteAddr)

	Created(w, adminUserResponse{
		ID:        user.ID,
		PublicID:  user.PublicID,
		Email:     user.Email,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Role:      user.Role,
		Status:    user.Status,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		UpdatedAt: user.UpdatedAt.Format(time.RFC3339),
	})
}

// impersonateResponse is returned by ImpersonateUser. subject_token is the
// short-lived (~10 min), single-use Logto subject token the SPA exchanges at
// Logto's /oidc/token endpoint (grant_type=token-exchange) for an access token
// scoped to the target user. The token must never be logged.
type impersonateResponse struct {
	SubjectToken string `json:"subject_token"`
	Target       struct {
		PublicID  string `json:"public_id"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Role      string `json:"role"`
	} `json:"target"`
}

// ImpersonateUser handles POST /api/v1/admin/users/{userID}/impersonate.
//
// This is the JWT-path (Logto-native) impersonation entrypoint, replacing the
// dead cookie-based StartImpersonation below. The route is mounted inside the
// /admin group, which is gated by useAuth + RequirePlatformAdmin, so only
// platform_admins reach this handler. It:
//
//  1. Resolves the target user and rejects self-impersonation.
//  2. Calls the Logto Management API to mint a subject token for the target's
//     Logto user ID (POST /api/subject-tokens), embedding the impersonator's
//     identity in the subject-token context for end-to-end audit visibility.
//  3. Writes an activity_logs row (who impersonated whom).
//  4. Returns the subject token to the SPA, which exchanges it at Logto's
//     /oidc/token for an access token whose sub=target and act.sub=admin.
//
// The exchanged access token is deliberately never produced or seen by this
// backend -- the SPA performs the exchange with the admin's own actor token.
func (h *AdminHandler) ImpersonateUser(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "authentication required")
		return
	}

	if h.logtoClient == nil {
		WriteError(w, http.StatusServiceUnavailable, "IMPERSONATION_UNAVAILABLE",
			"impersonation requires Logto Management API configuration")
		return
	}

	target, ok := h.resolveUserParam(w, r)
	if !ok {
		return
	}

	if target.ID == sess.UserID {
		WriteError(w, http.StatusBadRequest, "SELF_IMPERSONATION", "cannot impersonate yourself")
		return
	}

	if target.LogtoUserID == nil || *target.LogtoUserID == "" {
		// Unclaimed / not-yet-mirrored users have no Logto identity to assume.
		WriteError(w, http.StatusBadRequest, "NO_LOGTO_IDENTITY",
			"target user has no linked Logto account and cannot be impersonated")
		return
	}

	// Embed the impersonator + a machine-readable reason in the subject-token
	// context so the audit signal is visible in Logto's own logs and in the
	// issued impersonation token, not just our activity_logs.
	subjectCtx := map[string]interface{}{
		"impersonator_public_id": sess.PublicID,
		"impersonator_user_id":   sess.UserID,
		"reason":                 "court_command_admin_impersonation",
	}

	tok, err := h.logtoClient.CreateSubjectToken(r.Context(), *target.LogtoUserID, subjectCtx)
	if err != nil {
		InternalError(w, "failed to create impersonation token")
		return
	}

	// Audit: record who impersonated whom. Mirrors the legacy
	// start_impersonation action name so existing log filters keep working.
	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "start_impersonation", "user", &target.ID, map[string]string{
		"target_user_public_id": target.PublicID,
		"method":                "logto_token_exchange",
	}, r.RemoteAddr)

	resp := impersonateResponse{SubjectToken: tok.SubjectToken}
	resp.Target.PublicID = target.PublicID
	resp.Target.FirstName = target.FirstName
	resp.Target.LastName = target.LastName
	resp.Target.Role = target.Role

	Success(w, resp)
}

// StartImpersonation handles POST /admin/impersonate/{userID}.
//
// DEPRECATED legacy cookie-path impersonation. Non-functional under the JWT
// auth path the SPA now uses (it reads/writes the cc_session cookie which the
// JWT chain ignores). Superseded by ImpersonateUser above. Kept registered for
// the cookie-only testutil path until Phase 6 deletes the cookie session store
// entirely. Do NOT wire new callers to this.
//
// Creates a new session as the target user with impersonator metadata.
func (h *AdminHandler) StartImpersonation(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "not authenticated")
		return
	}

	// Don't allow nested impersonation
	if sess.IsImpersonating() {
		WriteError(w, http.StatusBadRequest, "ALREADY_IMPERSONATING", "stop current impersonation first")
		return
	}

	targetUser, ok := h.resolveUserParam(w, r)
	if !ok {
		return
	}

	// Don't impersonate yourself
	if targetUser.ID == sess.UserID {
		WriteError(w, http.StatusBadRequest, "SELF_IMPERSONATION", "cannot impersonate yourself")
		return
	}

	// Get admin's current session token so we can restore it later
	adminCookie, err := r.Cookie(session.SessionCookieName)
	if err != nil {
		InternalError(w, "failed to read session cookie")
		return
	}

	// Create an impersonation session as the target user
	impersonationData := &session.Data{
		UserID: targetUser.ID,
		Email: func() string {
			if targetUser.Email != nil {
				return *targetUser.Email
			}
			return ""
		}(),
		Role:                 targetUser.Role,
		PublicID:             targetUser.PublicID,
		ImpersonatorID:       sess.UserID,
		ImpersonatorPublicID: sess.PublicID,
		ImpersonatorToken:    adminCookie.Value,
	}

	token, err := h.sessionStore.Create(r.Context(), impersonationData)
	if err != nil {
		InternalError(w, "failed to create impersonation session")
		return
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.UserID, "start_impersonation", "user", &targetUser.ID, map[string]interface{}{
		"target_user_public_id": targetUser.PublicID,
	}, r.RemoteAddr)

	// Set the new impersonation session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     session.SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int((4 * time.Hour).Seconds()), // shorter TTL for impersonation
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	Success(w, map[string]interface{}{
		"impersonating": map[string]interface{}{
			"user_id":   targetUser.ID,
			"public_id": targetUser.PublicID,
			"name":      targetUser.FirstName + " " + targetUser.LastName,
			"role":      targetUser.Role,
		},
	})
}

// StopImpersonation handles POST /admin/stop-impersonation.
//
// Under the Logto-native (JWT) flow, "stopping" is performed client-side: the
// SPA discards the impersonation token and reverts to the admin's own token.
// This endpoint exists purely to write the matching audit-log entry. It
// detects the JWT path by reading the `act` claim off the request (the
// impersonation token carries act.sub=<admin logto id>); when present it logs
// stop_impersonation and returns success WITHOUT touching the cookie store.
//
// The legacy cookie branch (sess.IsImpersonating(), via the cc_session
// Impersonator* fields) is retained for the cookie-only testutil path until
// Phase 6 removes the cookie session store.
func (h *AdminHandler) StopImpersonation(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		Unauthorized(w, "not authenticated")
		return
	}

	// JWT path: the request is authenticated with an impersonation token whose
	// act.sub identifies the impersonating admin. There is no server-side
	// session to tear down (the SPA discards the token); just record the audit
	// entry. sess.UserID is the impersonated (target) user's local id.
	if claims, ok := auth.ClaimsFromContext(r.Context()); ok && claims.IsImpersonated() {
		var impersonatorID int64
		if admin, err := h.queries.GetUserByLogtoUserID(r.Context(), &claims.ActorSubject); err == nil {
			impersonatorID = admin.ID
		}
		h.activityLogSvc.LogActivity(r.Context(), impersonatorID, "stop_impersonation", "user", &sess.UserID, map[string]string{
			"method": "logto_token_exchange",
		}, r.RemoteAddr)
		Success(w, map[string]interface{}{"restored": true})
		return
	}

	if !sess.IsImpersonating() {
		WriteError(w, http.StatusBadRequest, "NOT_IMPERSONATING", "not currently impersonating anyone")
		return
	}

	// Delete the impersonation session
	currentCookie, err := r.Cookie(session.SessionCookieName)
	if err == nil {
		_ = h.sessionStore.Delete(r.Context(), currentCookie.Value)
	}

	h.activityLogSvc.LogActivity(r.Context(), sess.ImpersonatorID, "stop_impersonation", "user", &sess.UserID, nil, r.RemoteAddr)

	// Restore the admin's original session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     session.SessionCookieName,
		Value:    sess.ImpersonatorToken,
		Path:     "/",
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	Success(w, map[string]interface{}{
		"restored": true,
	})
}

// CleanOrphanedUploads deletes upload files not referenced by any entity.
func (h *AdminHandler) CleanOrphanedUploads(w http.ResponseWriter, r *http.Request) {
	if h.uploadSvc == nil {
		WriteError(w, http.StatusInternalServerError, "SERVICE_UNAVAILABLE", "Upload service not configured")
		return
	}

	count, err := h.uploadSvc.CleanOrphanedUploads(r.Context(), 0) // 0 = clean all orphans regardless of age
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "CLEANUP_FAILED", "Failed to clean orphaned uploads")
		return
	}

	Success(w, map[string]interface{}{
		"deleted": count,
	})
}

// NOTE: parsePagination is defined in team.go within the same package.
