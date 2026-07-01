// api/handler/court.go
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/service"
	"github.com/court-command/court-command/session"
)

// CourtHandler handles standalone/floating court HTTP requests.
type CourtHandler struct {
	venueService *service.VenueService
}

// NewCourtHandler creates a new CourtHandler.
func NewCourtHandler(venueService *service.VenueService) *CourtHandler {
	return &CourtHandler{venueService: venueService}
}

// Routes returns a chi.Router with all standalone court routes mounted.
func (h *CourtHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.ListCourts)
	r.Post("/", h.CreateFloatingCourt)
	r.Get("/{courtID}", h.GetCourt)
	r.Patch("/{courtID}", h.UpdateCourt)
	r.Delete("/{courtID}", h.DeleteCourt)

	return r
}

// ListCourts lists all courts across the platform with pagination.
//
// Query parameters:
//   - limit, offset: standard pagination (limit 1-100, default 20).
//   - venue_id: filter to a single venue's courts.
//   - is_active: "true" or "false" — filter by active status.
func (h *CourtHandler) ListCourts(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r)

	filters := service.CourtListFilters{}
	q := r.URL.Query()

	if v := q.Get("venue_id"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "INVALID_VENUE_ID", "venue_id must be an integer")
			return
		}
		filters.VenueID = &id
	}

	if v := q.Get("is_active"); v != "" {
		switch v {
		case "true":
			t := true
			filters.IsActive = &t
		case "false":
			f := false
			filters.IsActive = &f
		default:
			WriteError(w, http.StatusBadRequest, "INVALID_IS_ACTIVE", "is_active must be 'true' or 'false'")
			return
		}
	}

	courts, total, err := h.venueService.ListCourts(r.Context(), filters, limit, offset)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Paginated(w, courts, total, int(limit), int(offset))
}

// CreateFloatingCourt creates a court not attached to any venue.
func (h *CourtHandler) CreateFloatingCourt(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	var body struct {
		Name        string  `json:"name"`
		SurfaceType *string `json:"surface_type"`
		IsShowCourt *bool   `json:"is_show_court"`
		IsActive    *bool   `json:"is_active"`
		IsTemporary *bool   `json:"is_temporary"`
		SortOrder   *int32  `json:"sort_order"`
		Notes       *string `json:"notes"`
		StreamURL   *string `json:"stream_url"`
		StreamTitle *string `json:"stream_title"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	if body.Name == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_FIELDS", "name is required")
		return
	}

	params := generated.CreateCourtParams{
		Name:            body.Name,
		SurfaceType:     body.SurfaceType,
		IsActive:        true,
		Notes:           body.Notes,
		StreamUrl:       body.StreamURL,
		StreamTitle:     body.StreamTitle,
		CreatedByUserID: pgtype.Int8{Int64: sess.UserID, Valid: true},
	}

	if body.IsShowCourt != nil {
		params.IsShowCourt = *body.IsShowCourt
	}
	if body.IsActive != nil {
		params.IsActive = *body.IsActive
	}
	if body.IsTemporary != nil {
		params.IsTemporary = *body.IsTemporary
	}
	if body.SortOrder != nil {
		params.SortOrder = *body.SortOrder
	}

	court, err := h.venueService.CreateCourt(r.Context(), params)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Created(w, court)
}

// ListCourtsByTournament returns every court that has matches in the
// given tournament, each enriched with its active_match and on_deck_match.
// This endpoint is public (no auth) — it powers the ref/scorekeeper court
// grids. It reads the tournament ID from the "tournamentID" URL param.
func (h *CourtHandler) ListCourtsByTournament(w http.ResponseWriter, r *http.Request) {
	tournamentID, err := strconv.ParseInt(chi.URLParam(r, "tournamentID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid tournament ID")
		return
	}

	courts, err := h.venueService.ListCourtsByTournament(r.Context(), tournamentID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, courts)
}

// AssignCourtToTournament links an existing court to a tournament.
func (h *CourtHandler) AssignCourtToTournament(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	tournamentID, err := strconv.ParseInt(chi.URLParam(r, "tournamentID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid tournament ID")
		return
	}

	var body struct {
		CourtID int64 `json:"court_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}
	if body.CourtID == 0 {
		WriteError(w, http.StatusBadRequest, "MISSING_COURT_ID", "court_id is required")
		return
	}

	tc, err := h.venueService.AssignCourtToTournament(r.Context(), tournamentID, body.CourtID, false)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, tc)
}

// CreateTempCourtForTournament creates a new temporary court and assigns it to the tournament.
func (h *CourtHandler) CreateTempCourtForTournament(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	tournamentID, err := strconv.ParseInt(chi.URLParam(r, "tournamentID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid tournament ID")
		return
	}

	var body struct {
		Name        string  `json:"name"`
		SurfaceType *string `json:"surface_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}
	if body.Name == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_NAME", "name is required")
		return
	}

	court, err := h.venueService.CreateTempCourtForTournament(r.Context(), tournamentID, body.Name, body.SurfaceType, sess.UserID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, court)
}

// UnassignCourtFromTournament removes a court from a tournament.
func (h *CourtHandler) UnassignCourtFromTournament(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	tournamentID, err := strconv.ParseInt(chi.URLParam(r, "tournamentID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid tournament ID")
		return
	}

	courtID, err := strconv.ParseInt(chi.URLParam(r, "courtID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return
	}

	if err := h.venueService.UnassignCourtFromTournament(r.Context(), tournamentID, courtID); err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, map[string]string{"message": "court unassigned"})
}

// GetCourt retrieves a court by ID.
func (h *CourtHandler) GetCourt(w http.ResponseWriter, r *http.Request) {
	courtID, err := strconv.ParseInt(chi.URLParam(r, "courtID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return
	}

	court, err := h.venueService.GetCourt(r.Context(), courtID)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, court)
}

// UpdateCourt updates a court with stream type auto-detection.
func (h *CourtHandler) UpdateCourt(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	courtID, err := strconv.ParseInt(chi.URLParam(r, "courtID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return
	}

	// Court-ownership guard — mirrors the overlay config write handlers so a
	// caller cannot modify a court outside their org/tournament. Platform
	// admins, the court creator, and managers of the court's owning venue pass.
	ok, err := h.venueService.CanManageCourt(r.Context(), courtID, sess.UserID, sess.Role)
	if err != nil {
		handleServiceError(w, err)
		return
	}
	if !ok {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "You do not have permission to manage this court")
		return
	}

	var body struct {
		Name         *string `json:"name"`
		SurfaceType  *string `json:"surface_type"`
		IsShowCourt  *bool   `json:"is_show_court"`
		IsActive     *bool   `json:"is_active"`
		IsTemporary  *bool   `json:"is_temporary"`
		SortOrder    *int32  `json:"sort_order"`
		Notes        *string `json:"notes"`
		StreamURL    *string `json:"stream_url"`
		StreamType   *string `json:"stream_type"`
		StreamIsLive *bool   `json:"stream_is_live"`
		StreamTitle  *string `json:"stream_title"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	params := generated.UpdateCourtParams{
		CourtID:     courtID,
		Name:        body.Name,
		SurfaceType: body.SurfaceType,
		Notes:       body.Notes,
		StreamUrl:   body.StreamURL,
		StreamType:  body.StreamType,
		StreamTitle: body.StreamTitle,
	}

	if body.IsShowCourt != nil {
		params.IsShowCourt = pgtype.Bool{Bool: *body.IsShowCourt, Valid: true}
	}
	if body.IsActive != nil {
		params.IsActive = pgtype.Bool{Bool: *body.IsActive, Valid: true}
	}
	if body.IsTemporary != nil {
		params.IsTemporary = pgtype.Bool{Bool: *body.IsTemporary, Valid: true}
	}
	if body.SortOrder != nil {
		params.SortOrder = pgtype.Int4{Int32: *body.SortOrder, Valid: true}
	}
	if body.StreamIsLive != nil {
		params.StreamIsLive = pgtype.Bool{Bool: *body.StreamIsLive, Valid: true}
	}

	court, err := h.venueService.UpdateCourt(r.Context(), courtID, params)
	if err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, court)
}

// DeleteCourt soft-deletes a court.
func (h *CourtHandler) DeleteCourt(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	courtID, err := strconv.ParseInt(chi.URLParam(r, "courtID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid court ID")
		return
	}

	// Court-ownership guard — mirrors the overlay config write handlers so a
	// caller cannot delete a court outside their org/tournament. Platform
	// admins, the court creator, and managers of the court's owning venue pass.
	ok, err := h.venueService.CanManageCourt(r.Context(), courtID, sess.UserID, sess.Role)
	if err != nil {
		handleServiceError(w, err)
		return
	}
	if !ok {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "You do not have permission to manage this court")
		return
	}

	if err := h.venueService.DeleteCourt(r.Context(), courtID); err != nil {
		handleServiceError(w, err)
		return
	}

	Success(w, map[string]string{"message": "court deleted"})
}
