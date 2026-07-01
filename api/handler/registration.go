// api/handler/registration.go
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

// RegistrationHandler handles registration HTTP requests.
type RegistrationHandler struct {
	regSvc *service.RegistrationService
}

// NewRegistrationHandler creates a new RegistrationHandler.
func NewRegistrationHandler(svc *service.RegistrationService) *RegistrationHandler {
	return &RegistrationHandler{regSvc: svc}
}

// Routes returns a chi.Router with the mutating registration routes. Expects
// to be mounted under /divisions/{divisionID}/registrations behind the
// authenticated + sport-isolation middleware chain (see router.go); each
// handler additionally enforces role checks. The public read routes
// (ListRegistrations, ListSeekingPartner, GetRegistration) are registered
// directly on the parent node in router.go so they stay unauthenticated.
func (h *RegistrationHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Post("/", h.Register)
	r.Patch("/{registrationID}/status", h.UpdateStatus)
	r.Patch("/{registrationID}/seed", h.UpdateSeed)
	r.Patch("/{registrationID}/placement", h.UpdatePlacement)
	r.Post("/{registrationID}/check-in", h.CheckIn)
	r.Post("/{registrationID}/withdraw", h.WithdrawMidTournament)
	r.Patch("/{registrationID}/admin-notes", h.UpdateAdminNotes)
	r.Post("/bulk-no-show", h.BulkNoShow)

	return r
}

// parseDivisionID extracts the divisionID from the URL.
func parseDivisionID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "divisionID"), 10, 64)
}

// isRegistrationStaff reports whether the current request is made by a
// privileged staff member who may see staff-only registration fields
// (admin_notes). The registration read routes are public, so unauthenticated
// callers and plain players never receive admin_notes; only platform admins and
// tournament directors do.
func isRegistrationStaff(r *http.Request) bool {
	sess := session.SessionData(r.Context())
	if sess == nil {
		return false
	}
	switch sess.Role {
	case "platform_admin", "tournament_director":
		return true
	default:
		return false
	}
}

// canManageRegistrations reports whether the given role may mutate
// registrations (status, seed, placement, check-in, withdraw, admin notes).
func canManageRegistrations(role string) bool {
	switch role {
	case "platform_admin", "tournament_director":
		return true
	default:
		return false
	}
}

// Register creates a new registration.
func (h *RegistrationHandler) Register(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	var body struct {
		TeamID            *int64  `json:"team_id"`
		PlayerID          *int64  `json:"player_id"`
		RegistrationNotes *string `json:"registration_notes"`
		AdminNotes        *string `json:"admin_notes"`
		SeekingPartner    *bool   `json:"seeking_partner"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	params := generated.CreateRegistrationParams{
		DivisionID:         divisionID,
		RegisteredByUserID: sess.UserID,
		RegistrationNotes:  body.RegistrationNotes,
		AdminNotes:         body.AdminNotes,
	}

	if body.TeamID != nil {
		params.TeamID = pgtype.Int8{Int64: *body.TeamID, Valid: true}
	}
	if body.PlayerID != nil {
		params.PlayerID = pgtype.Int8{Int64: *body.PlayerID, Valid: true}
	}
	if body.SeekingPartner != nil {
		params.SeekingPartner = pgtype.Bool{Bool: *body.SeekingPartner, Valid: true}
	}

	reg, err := h.regSvc.Register(r.Context(), params)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Created(w, reg)
}

// GetRegistration retrieves a registration by ID.
func (h *RegistrationHandler) GetRegistration(w http.ResponseWriter, r *http.Request) {
	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	reg, err := h.regSvc.GetByID(r.Context(), regID, isRegistrationStaff(r))
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}

// ListRegistrations lists registrations for a division.
func (h *RegistrationHandler) ListRegistrations(w http.ResponseWriter, r *http.Request) {
	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	limit, offset := parsePagination(r)
	includeStaff := isRegistrationStaff(r)

	// Check for optional status filter
	if status := r.URL.Query().Get("status"); status != "" {
		regs, total, err := h.regSvc.ListByDivisionAndStatus(r.Context(), divisionID, status, limit, offset, includeStaff)
		if err != nil {
			HandleServiceError(w, err)
			return
		}
		Paginated(w, regs, total, int(limit), int(offset))
		return
	}

	regs, total, err := h.regSvc.ListByDivision(r.Context(), divisionID, limit, offset, includeStaff)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Paginated(w, regs, total, int(limit), int(offset))
}

// UpdateStatus updates a registration's status.
func (h *RegistrationHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	var body struct {
		Status string `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	if body.Status == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_FIELDS", "status is required")
		return
	}

	reg, err := h.regSvc.UpdateStatus(r.Context(), divisionID, regID, body.Status)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}

// UpdateSeed updates a registration's seed.
func (h *RegistrationHandler) UpdateSeed(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	var body struct {
		Seed int32 `json:"seed"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	seed := pgtype.Int4{Int32: body.Seed, Valid: true}

	reg, err := h.regSvc.UpdateSeed(r.Context(), divisionID, regID, seed)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}

// UpdatePlacement updates a registration's final placement.
func (h *RegistrationHandler) UpdatePlacement(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	var body struct {
		Placement int32 `json:"placement"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	placement := pgtype.Int4{Int32: body.Placement, Valid: true}

	reg, err := h.regSvc.UpdatePlacement(r.Context(), divisionID, regID, placement)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}

// CheckIn marks a registration as checked in.
func (h *RegistrationHandler) CheckIn(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	reg, err := h.regSvc.CheckIn(r.Context(), divisionID, regID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}

// WithdrawMidTournament withdraws a registration mid-tournament.
func (h *RegistrationHandler) WithdrawMidTournament(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	reg, err := h.regSvc.WithdrawMidTournament(r.Context(), divisionID, regID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}

// BulkNoShow marks the given registration IDs as no-show, scoped to the
// division in the URL. Callers must supply registration_ids explicitly;
// there is no "mark everyone" shortcut.
func (h *RegistrationHandler) BulkNoShow(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	var body struct {
		RegistrationIDs []int64 `json:"registration_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body; expected {\"registration_ids\": [1,2,3]}")
		return
	}

	if err := h.regSvc.BulkNoShow(r.Context(), divisionID, body.RegistrationIDs); err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, map[string]interface{}{"message": "bulk no-show completed", "count": len(body.RegistrationIDs)})
}

// ListSeekingPartner lists registrations that are seeking a partner.
func (h *RegistrationHandler) ListSeekingPartner(w http.ResponseWriter, r *http.Request) {
	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regs, err := h.regSvc.ListSeekingPartner(r.Context(), divisionID)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, regs)
}

// UpdateAdminNotes updates the admin notes on a registration.
func (h *RegistrationHandler) UpdateAdminNotes(w http.ResponseWriter, r *http.Request) {
	sess := session.SessionData(r.Context())
	if sess == nil {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}
	if !canManageRegistrations(sess.Role) {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only platform admins or tournament directors can manage registrations")
		return
	}

	divisionID, err := parseDivisionID(r)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid division ID")
		return
	}

	regID, err := strconv.ParseInt(chi.URLParam(r, "registrationID"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid registration ID")
		return
	}

	var body struct {
		AdminNotes *string `json:"admin_notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "Invalid request body")
		return
	}

	reg, err := h.regSvc.UpdateAdminNotes(r.Context(), divisionID, regID, body.AdminNotes)
	if err != nil {
		HandleServiceError(w, err)
		return
	}

	Success(w, reg)
}
