package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/court-command/court-command/overlay"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
	"github.com/go-chi/chi/v5"
)

// OverlayHandler handles overlay-related HTTP requests.
type OverlayHandler struct {
	overlayService       *service.OverlayService
	sourceProfileService *service.SourceProfileService
}

// NewOverlayHandler creates a new OverlayHandler.
func NewOverlayHandler(overlayService *service.OverlayService, sourceProfileService *service.SourceProfileService) *OverlayHandler {
	return &OverlayHandler{
		overlayService:       overlayService,
		sourceProfileService: sourceProfileService,
	}
}

// parseCourtID extracts the court identifier from the URL. It accepts either
// a numeric ID (e.g. "7") or a court slug (e.g. "court-1"). Slugs are resolved
// to numeric IDs via the database so callers always receive an int64.
func (h *OverlayHandler) parseCourtID(r *http.Request) (int64, error) {
	raw := chi.URLParam(r, "courtID")
	// Fast path: numeric ID.
	if id, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return id, nil
	}
	// Slow path: treat the value as a slug and resolve via DB.
	return h.overlayService.ResolveCourtIDBySlug(r.Context(), raw)
}

// requireSession checks that the request has a valid session and returns it.
// Returns nil and writes a 401 error if not authenticated.
func (h *OverlayHandler) requireSession(w http.ResponseWriter, r *http.Request) *session.Data {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication required")
		return nil
	}
	return sess
}

// requireCourtManage authenticates the request and verifies the caller may
// manage the target court's overlay configuration. On success it returns the
// resolved courtID and true. On any failure it writes the appropriate error
// response (401/400/403/404) and returns false, so callers can simply
// `if courtID, ok := h.requireCourtManage(w, r); !ok { return }`.
func (h *OverlayHandler) requireCourtManage(w http.ResponseWriter, r *http.Request) (int64, bool) {
	sess := h.requireSession(w, r)
	if sess == nil {
		return 0, false
	}

	courtID, err := h.parseCourtID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return 0, false
	}

	ok, err := h.overlayService.CanManageCourt(r.Context(), courtID, sess.UserID, sess.Role)
	if err != nil {
		HandleServiceError(w, err)
		return 0, false
	}
	if !ok {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "You do not have permission to manage this court's overlay")
		return 0, false
	}

	return courtID, true
}

// ResolveCourtSlug handles GET /api/v1/overlay/court/{courtID}/resolve
// Public endpoint — resolves a court slug (or numeric ID) to its canonical
// court_id and slug. Used by the frontend to map URL slugs to numeric IDs
// without requiring authentication (unlike GET /api/v1/courts).
func (h *OverlayHandler) ResolveCourtSlug(w http.ResponseWriter, r *http.Request) {
	courtID, err := h.parseCourtID(r)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	// Fetch the court record to return both ID and slug.
	slug, err := h.overlayService.GetCourtSlug(r.Context(), courtID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, map[string]interface{}{
		"court_id": courtID,
		"slug":     slug,
	})
}

// GetOverlayData handles GET /api/v1/overlay/court/{courtID}/data
// Public endpoint (token-validated if configured).
func (h *OverlayHandler) GetOverlayData(w http.ResponseWriter, r *http.Request) {
	courtID, err := h.parseCourtID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return
	}

	// Validate overlay token if present
	token := r.URL.Query().Get("token")
	if err := h.overlayService.ValidateToken(r.Context(), courtID, token); err != nil {
		WriteError(w, http.StatusForbidden, "INVALID_TOKEN", err.Error())
		return
	}

	// Accept demo={true|1} as equivalent truthy values so frontend callers
	// can use either spelling.
	demoParam := r.URL.Query().Get("demo")
	useDemoData := demoParam == "true" || demoParam == "1"

	data, err := h.overlayService.GetOverlayData(r.Context(), courtID, useDemoData)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "RESOLVE_FAILED", err.Error())
		return
	}

	Success(w, data)
}

// GetConfig handles GET /api/v1/overlay/court/{courtID}/config
func (h *OverlayHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	config, err := h.overlayService.GetOrCreateConfig(r.Context(), courtID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "GET_FAILED", "Failed to get overlay config")
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// UpdateTheme handles PUT /api/v1/overlay/court/{courtID}/config/theme
func (h *OverlayHandler) UpdateTheme(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	var req struct {
		ThemeID        string          `json:"theme_id"`
		ColorOverrides json.RawMessage `json:"color_overrides"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	if req.ThemeID == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_FIELD", "theme_id is required")
		return
	}

	config, err := h.overlayService.UpdateTheme(r.Context(), courtID, req.ThemeID, req.ColorOverrides)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// UpdateElements handles PUT /api/v1/overlay/court/{courtID}/config/elements
func (h *OverlayHandler) UpdateElements(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	var req struct {
		Elements json.RawMessage `json:"elements"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	config, err := h.overlayService.UpdateElements(r.Context(), courtID, req.Elements)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "UPDATE_FAILED", err.Error())
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// GenerateToken handles POST /api/v1/overlay/court/{courtID}/config/token/generate
func (h *OverlayHandler) GenerateToken(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	config, err := h.overlayService.GenerateToken(r.Context(), courtID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "TOKEN_FAILED", err.Error())
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// RevokeToken handles DELETE /api/v1/overlay/court/{courtID}/config/token
func (h *OverlayHandler) RevokeToken(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	config, err := h.overlayService.RevokeToken(r.Context(), courtID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "REVOKE_FAILED", err.Error())
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// SetSourceProfile handles PUT /api/v1/overlay/court/{courtID}/config/source-profile
func (h *OverlayHandler) SetSourceProfile(w http.ResponseWriter, r *http.Request) {
	sess := h.requireSession(w, r)
	if sess == nil {
		return
	}

	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	var req struct {
		SourceProfileID *int64 `json:"source_profile_id"` // null to clear
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	// When linking a profile (not clearing), verify the caller owns the
	// referenced source profile (or is a platform admin) — mirroring the
	// ownership gate the dedicated source-profile handlers enforce. Without
	// this, any court manager could wire their court to a profile they do
	// not own.
	if req.SourceProfileID != nil {
		profile, err := h.sourceProfileService.GetByID(r.Context(), *req.SourceProfileID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "Source profile not found")
			return
		}
		if profile.CreatedByUserID != sess.UserID && sess.Role != "platform_admin" {
			WriteError(w, http.StatusForbidden, "FORBIDDEN", "Access denied")
			return
		}
	}

	config, err := h.overlayService.SetSourceProfile(r.Context(), courtID, req.SourceProfileID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "UPDATE_FAILED", err.Error())
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// UpdateDataOverrides handles PUT /api/v1/overlay/court/{courtID}/config/data-overrides
// Allows Broadcast Operators to override any canonical overlay field per-court
// without modifying the underlying tournament/team/match data. Authenticated.
func (h *OverlayHandler) UpdateDataOverrides(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	var req struct {
		Overrides json.RawMessage `json:"overrides"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	config, err := h.overlayService.UpdateDataOverrides(r.Context(), courtID, req.Overrides)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// ClearDataOverrides handles DELETE /api/v1/overlay/court/{courtID}/config/data-overrides
// Resets all per-court data overrides to empty. Authenticated.
func (h *OverlayHandler) ClearDataOverrides(w http.ResponseWriter, r *http.Request) {
	courtID, ok := h.requireCourtManage(w, r)
	if !ok {
		return
	}

	config, err := h.overlayService.ClearDataOverrides(r.Context(), courtID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, service.ToOverlayConfigResponse(config))
}

// ListThemes handles GET /api/v1/overlay/themes
func (h *OverlayHandler) ListThemes(w http.ResponseWriter, r *http.Request) {
	Success(w, overlay.AllThemes())
}

// GetTheme handles GET /api/v1/overlay/themes/{themeID}
func (h *OverlayHandler) GetTheme(w http.ResponseWriter, r *http.Request) {
	themeID := chi.URLParam(r, "themeID")
	theme := overlay.GetTheme(themeID)
	Success(w, theme)
}

// GetDemoData handles GET /api/v1/overlay/demo-data
func (h *OverlayHandler) GetDemoData(w http.ResponseWriter, r *http.Request) {
	Success(w, overlay.DemoData())
}

// ReceiveWebhook handles POST /api/v1/overlay/webhook/{courtID}
func (h *OverlayHandler) ReceiveWebhook(w http.ResponseWriter, r *http.Request) {
	courtID, err := h.parseCourtID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return
	}

	// Get overlay config to find source profile
	config, err := h.overlayService.GetOrCreateConfig(r.Context(), courtID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "CONFIG_ERROR", "Failed to get overlay config")
		return
	}

	if !config.SourceProfileID.Valid {
		WriteError(w, http.StatusBadRequest, "NO_SOURCE", "No source profile configured for this court")
		return
	}

	// Get source profile for webhook secret and field mapping
	profile, err := h.sourceProfileService.GetByID(r.Context(), config.SourceProfileID.Int64)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "PROFILE_ERROR", "Source profile not found")
		return
	}

	if profile.SourceType != "webhook" {
		WriteError(w, http.StatusBadRequest, "WRONG_TYPE", "Source profile is not configured for webhooks")
		return
	}

	// Read and validate webhook body
	body, err := overlay.ReadWebhookBody(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "READ_FAILED", "Failed to read webhook body")
		return
	}

	// Validate signature
	signature := r.Header.Get("X-Webhook-Signature")
	webhookSecret := ""
	if profile.WebhookSecret != nil {
		webhookSecret = *profile.WebhookSecret
	}
	if err := overlay.ValidateWebhookSignature(body, signature, webhookSecret); err != nil {
		WriteError(w, http.StatusForbidden, "INVALID_SIGNATURE", err.Error())
		return
	}

	// Apply field mapping to transform external data into canonical format
	overlayData, err := overlay.ApplyFieldMapping(json.RawMessage(body), profile.FieldMapping)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "MAPPING_FAILED", err.Error())
		return
	}

	// Broadcast the transformed data to the overlay WS channel
	h.overlayService.BroadcastOverlayData(r.Context(), courtID, overlayData)

	Success(w, map[string]string{"status": "accepted"})
}
