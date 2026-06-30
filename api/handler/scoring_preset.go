package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
)

// ScoringPresetHandler handles scoring preset HTTP requests.
type ScoringPresetHandler struct {
	service *service.ScoringPresetService
}

// NewScoringPresetHandler creates a new ScoringPresetHandler.
func NewScoringPresetHandler(service *service.ScoringPresetService) *ScoringPresetHandler {
	return &ScoringPresetHandler{service: service}
}

// canManageScoringPresets reports whether the given role may create or modify
// scoring presets. Presets are a global, cross-tenant pool, so writes are
// restricted to privileged operational roles; plain players (and any other
// authenticated role) get read-only access via List/Get.
func canManageScoringPresets(role string) bool {
	switch role {
	case "platform_admin", "tournament_director":
		return true
	default:
		return false
	}
}

// Routes returns a chi.Router with all scoring preset routes mounted.
func (h *ScoringPresetHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{presetID}", h.Get)
	r.Patch("/{presetID}", h.Update)
	r.Post("/{presetID}/deactivate", h.Deactivate)
	r.Post("/{presetID}/activate", h.Activate)

	return r
}

// List returns all active scoring presets (or all if ?all=true).
func (h *ScoringPresetHandler) List(w http.ResponseWriter, r *http.Request) {
	var presets []service.ScoringPresetResponse
	var err error

	if r.URL.Query().Get("all") == "true" {
		presets, err = h.service.ListAll(r.Context())
	} else {
		presets, err = h.service.ListActive(r.Context())
	}

	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, presets)
}

// Create creates a new scoring preset.
func (h *ScoringPresetHandler) Create(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageScoringPresets(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage scoring presets")
		return
	}

	var body struct {
		Name               string  `json:"name"`
		Description        *string `json:"description"`
		Sport              *string `json:"sport"`
		GamesPerSet        *int32  `json:"games_per_set"`
		SetsToWin          *int32  `json:"sets_to_win"`
		PointsToWin        *int32  `json:"points_to_win"`
		WinBy              *int32  `json:"win_by"`
		MaxPoints          *int32  `json:"max_points"`
		RallyScoring       *bool   `json:"rally_scoring"`
		TimeoutsPerGame    *int32  `json:"timeouts_per_game"`
		TimeoutDurationSec *int32  `json:"timeout_duration_sec"`
		FreezeAt           *int32  `json:"freeze_at"`
	}

	if errMsg := DecodeJSON(r, &body); errMsg != "" {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", errMsg)
		return
	}

	params := generated.CreateScoringPresetParams{
		Name:               body.Name,
		Description:        body.Description,
		Sport:              "pickleball",
		GamesPerSet:        1,
		SetsToWin:          1,
		PointsToWin:        11,
		WinBy:              2,
		TimeoutsPerGame:    0,
		TimeoutDurationSec: 60,
		CreatedByUserID:    pgtype.Int8{Int64: sess.UserID, Valid: true},
	}

	if body.Sport != nil {
		params.Sport = *body.Sport
	}
	if body.GamesPerSet != nil {
		params.GamesPerSet = *body.GamesPerSet
	}
	if body.SetsToWin != nil {
		params.SetsToWin = *body.SetsToWin
	}
	if body.PointsToWin != nil {
		params.PointsToWin = *body.PointsToWin
	}
	if body.WinBy != nil {
		params.WinBy = *body.WinBy
	}
	if body.MaxPoints != nil {
		params.MaxPoints = pgtype.Int4{Int32: *body.MaxPoints, Valid: true}
	}
	if body.RallyScoring != nil {
		params.RallyScoring = *body.RallyScoring
	}
	if body.TimeoutsPerGame != nil {
		params.TimeoutsPerGame = *body.TimeoutsPerGame
	}
	if body.TimeoutDurationSec != nil {
		params.TimeoutDurationSec = *body.TimeoutDurationSec
	}
	if body.FreezeAt != nil {
		params.FreezeAt = pgtype.Int4{Int32: *body.FreezeAt, Valid: true}
	}

	preset, err := h.service.Create(r.Context(), params)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Created(w, preset)
}

// Get retrieves a scoring preset by ID.
func (h *ScoringPresetHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid preset ID")
		return
	}

	preset, err := h.service.GetByID(r.Context(), id)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, preset)
}

// Update updates a scoring preset.
func (h *ScoringPresetHandler) Update(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageScoringPresets(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage scoring presets")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid preset ID")
		return
	}

	var body struct {
		Name               *string `json:"name"`
		Description        *string `json:"description"`
		Sport              *string `json:"sport"`
		GamesPerSet        *int32  `json:"games_per_set"`
		SetsToWin          *int32  `json:"sets_to_win"`
		PointsToWin        *int32  `json:"points_to_win"`
		WinBy              *int32  `json:"win_by"`
		MaxPoints          *int32  `json:"max_points"`
		RallyScoring       *bool   `json:"rally_scoring"`
		TimeoutsPerGame    *int32  `json:"timeouts_per_game"`
		TimeoutDurationSec *int32  `json:"timeout_duration_sec"`
		FreezeAt           *int32  `json:"freeze_at"`
	}

	if errMsg := DecodeJSON(r, &body); errMsg != "" {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", errMsg)
		return
	}

	params := generated.UpdateScoringPresetParams{
		Name:        body.Name,
		Description: body.Description,
		Sport:       body.Sport,
	}
	if body.GamesPerSet != nil {
		params.GamesPerSet = pgtype.Int4{Int32: *body.GamesPerSet, Valid: true}
	}
	if body.SetsToWin != nil {
		params.SetsToWin = pgtype.Int4{Int32: *body.SetsToWin, Valid: true}
	}
	if body.PointsToWin != nil {
		params.PointsToWin = pgtype.Int4{Int32: *body.PointsToWin, Valid: true}
	}
	if body.WinBy != nil {
		params.WinBy = pgtype.Int4{Int32: *body.WinBy, Valid: true}
	}
	if body.MaxPoints != nil {
		params.MaxPoints = pgtype.Int4{Int32: *body.MaxPoints, Valid: true}
	}
	if body.RallyScoring != nil {
		params.RallyScoring = pgtype.Bool{Bool: *body.RallyScoring, Valid: true}
	}
	if body.TimeoutsPerGame != nil {
		params.TimeoutsPerGame = pgtype.Int4{Int32: *body.TimeoutsPerGame, Valid: true}
	}
	if body.TimeoutDurationSec != nil {
		params.TimeoutDurationSec = pgtype.Int4{Int32: *body.TimeoutDurationSec, Valid: true}
	}
	if body.FreezeAt != nil {
		params.FreezeAt = pgtype.Int4{Int32: *body.FreezeAt, Valid: true}
	}

	preset, err := h.service.Update(r.Context(), id, params)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, preset)
}

// Deactivate deactivates a scoring preset.
func (h *ScoringPresetHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageScoringPresets(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage scoring presets")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid preset ID")
		return
	}

	if err := h.service.Deactivate(r.Context(), id); err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, map[string]string{"message": "preset deactivated"})
}

// Activate re-activates a scoring preset.
func (h *ScoringPresetHandler) Activate(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageScoringPresets(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage scoring presets")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "presetID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid preset ID")
		return
	}

	if err := h.service.Activate(r.Context(), id); err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, map[string]string{"message": "preset activated"})
}
