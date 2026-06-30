package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/db/generated"
)

// RegistrationService handles registration business logic.
type RegistrationService struct {
	queries *generated.Queries
}

// NewRegistrationService creates a new RegistrationService.
func NewRegistrationService(queries *generated.Queries) *RegistrationService {
	return &RegistrationService{queries: queries}
}

// RegistrationResponse is the public representation of a registration.
type RegistrationResponse struct {
	ID                 int64   `json:"id"`
	DivisionID         int64   `json:"division_id"`
	TeamID             *int64  `json:"team_id,omitempty"`
	PlayerID           *int64  `json:"player_id,omitempty"`
	RegisteredByUserID int64   `json:"registered_by_user_id"`
	Status             string  `json:"status"`
	Seed               *int32  `json:"seed,omitempty"`
	FinalPlacement     *int32  `json:"final_placement,omitempty"`
	RegistrationNotes  *string `json:"registration_notes,omitempty"`
	AdminNotes         *string `json:"admin_notes,omitempty"`
	SeekingPartner     bool    `json:"seeking_partner"`
	RegisteredAt       string  `json:"registered_at"`
	ApprovedAt         *string `json:"approved_at,omitempty"`
	WithdrawnAt        *string `json:"withdrawn_at,omitempty"`
	CheckedInAt        *string `json:"checked_in_at,omitempty"`
}

// toRegistrationResponse maps a registration row to its API representation.
// When includeStaff is false (unauthenticated / non-staff readers), staff-only
// fields (admin_notes) are omitted so internal tournament-director commentary is
// never leaked on the public read paths.
func toRegistrationResponse(r generated.Registration, includeStaff bool) RegistrationResponse {
	resp := RegistrationResponse{
		ID:                 r.ID,
		DivisionID:         r.DivisionID,
		RegisteredByUserID: r.RegisteredByUserID,
		Status:             r.Status,
		RegistrationNotes:  r.RegistrationNotes,
		RegisteredAt:       r.RegisteredAt.Format(time.RFC3339),
	}

	if includeStaff {
		resp.AdminNotes = r.AdminNotes
	}

	if r.TeamID.Valid {
		resp.TeamID = &r.TeamID.Int64
	}
	if r.PlayerID.Valid {
		resp.PlayerID = &r.PlayerID.Int64
	}
	if r.Seed.Valid {
		resp.Seed = &r.Seed.Int32
	}
	if r.FinalPlacement.Valid {
		resp.FinalPlacement = &r.FinalPlacement.Int32
	}
	if r.SeekingPartner.Valid {
		resp.SeekingPartner = r.SeekingPartner.Bool
	}
	if r.ApprovedAt.Valid {
		s := r.ApprovedAt.Time.Format(time.RFC3339)
		resp.ApprovedAt = &s
	}
	if r.WithdrawnAt.Valid {
		s := r.WithdrawnAt.Time.Format(time.RFC3339)
		resp.WithdrawnAt = &s
	}
	if r.CheckedInAt.Valid {
		s := r.CheckedInAt.Time.Format(time.RFC3339)
		resp.CheckedInAt = &s
	}

	return resp
}

// Register creates a new registration. Checks division status, capacity,
// and auto-approve settings.
func (s *RegistrationService) Register(ctx context.Context, params generated.CreateRegistrationParams) (RegistrationResponse, error) {
	// Get division to check status and capacity
	division, err := s.queries.GetDivisionByID(ctx, params.DivisionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "division not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get division for registration: %w", err)
	}

	// Division must be in registration_open status
	if division.Status != "registration_open" {
		return RegistrationResponse{}, &ValidationError{Message: "division is not open for registration"}
	}

	// Check capacity — if max_teams set, count all slot-occupying registrations.
	// Both 'approved' and 'checked_in' teams occupy a real field slot (matching
	// bracket generation and standings, which treat approved+checked_in as the
	// active set); counting only 'approved' would let check-ins free phantom
	// slots and allow registrations to exceed max_teams.
	if division.MaxTeams.Valid && division.MaxTeams.Int32 > 0 {
		activeCount, err := s.queries.CountActiveRegistrationsByDivision(ctx, params.DivisionID)
		if err != nil {
			return RegistrationResponse{}, fmt.Errorf("failed to count registrations: %w", err)
		}
		if activeCount >= int64(division.MaxTeams.Int32) {
			// Division is full — waitlist
			params.Status = "waitlisted"
		}
	}

	// Auto-approve if configured and not waitlisted
	if params.Status == "" {
		if division.AutoApprove.Valid && division.AutoApprove.Bool {
			params.Status = "approved"
		} else {
			params.Status = "pending"
		}
	}

	reg, err := s.queries.CreateRegistration(ctx, params)
	if err != nil {
		return RegistrationResponse{}, fmt.Errorf("failed to create registration: %w", err)
	}

	return toRegistrationResponse(reg, true), nil
}

// GetByID retrieves a registration by ID. includeStaff controls whether
// staff-only fields (admin_notes) are returned; pass false for unauthenticated
// or non-staff callers.
func (s *RegistrationService) GetByID(ctx context.Context, id int64, includeStaff bool) (RegistrationResponse, error) {
	reg, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration by id: %w", err)
	}
	return toRegistrationResponse(reg, includeStaff), nil
}

// ListByDivision returns registrations for a division. includeStaff controls
// whether staff-only fields (admin_notes) are returned.
func (s *RegistrationService) ListByDivision(ctx context.Context, divisionID int64, limit, offset int32, includeStaff bool) ([]RegistrationResponse, int64, error) {
	regs, err := s.queries.ListRegistrationsByDivision(ctx, generated.ListRegistrationsByDivisionParams{
		DivisionID: divisionID,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list registrations: %w", err)
	}

	count, err := s.queries.CountRegistrationsByDivision(ctx, divisionID)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count registrations: %w", err)
	}

	result := make([]RegistrationResponse, len(regs))
	for i, r := range regs {
		result[i] = toRegistrationResponse(r, includeStaff)
	}

	return result, count, nil
}

// ListByDivisionAndStatus returns registrations filtered by division and status.
// includeStaff controls whether staff-only fields (admin_notes) are returned.
func (s *RegistrationService) ListByDivisionAndStatus(ctx context.Context, divisionID int64, status string, limit, offset int32, includeStaff bool) ([]RegistrationResponse, int64, error) {
	regs, err := s.queries.ListRegistrationsByDivisionAndStatus(ctx, generated.ListRegistrationsByDivisionAndStatusParams{
		DivisionID: divisionID,
		Status:     status,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list registrations: %w", err)
	}

	count, err := s.queries.CountRegistrationsByDivisionAndStatus(ctx, generated.CountRegistrationsByDivisionAndStatusParams{
		DivisionID: divisionID,
		Status:     status,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count registrations: %w", err)
	}

	result := make([]RegistrationResponse, len(regs))
	for i, r := range regs {
		result[i] = toRegistrationResponse(r, includeStaff)
	}

	return result, count, nil
}

// UpdateStatus updates a registration's status, with auto-promote from waitlist on withdrawal/rejection.
// The registration must belong to divisionID; otherwise a not-found error is
// returned so callers cannot mutate registrations outside the URL's division.
func (s *RegistrationService) UpdateStatus(ctx context.Context, divisionID, id int64, newStatus string) (RegistrationResponse, error) {
	reg, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration for status update: %w", err)
	}
	if reg.DivisionID != divisionID {
		return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
	}

	updated, err := s.queries.UpdateRegistrationStatus(ctx, generated.UpdateRegistrationStatusParams{
		ID:     id,
		Status: newStatus,
	})
	if err != nil {
		return RegistrationResponse{}, fmt.Errorf("failed to update registration status: %w", err)
	}

	// Auto-promote next waitlisted if this was a withdrawal or rejection
	if newStatus == "withdrawn" || newStatus == "rejected" {
		division, err := s.queries.GetDivisionByID(ctx, reg.DivisionID)
		if err == nil && division.AutoPromoteWaitlist.Valid && division.AutoPromoteWaitlist.Bool {
			next, err := s.queries.GetNextWaitlisted(ctx, reg.DivisionID)
			if err == nil {
				_, _ = s.queries.UpdateRegistrationStatus(ctx, generated.UpdateRegistrationStatusParams{
					ID:     next.ID,
					Status: "approved",
				})
			}
		}
	}

	return toRegistrationResponse(updated, true), nil
}

// UpdateSeed updates a registration's seed. The registration must belong to
// divisionID; otherwise a not-found error is returned.
func (s *RegistrationService) UpdateSeed(ctx context.Context, divisionID, id int64, seed pgtype.Int4) (RegistrationResponse, error) {
	existing, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration for seed update: %w", err)
	}
	if existing.DivisionID != divisionID {
		return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
	}

	reg, err := s.queries.UpdateRegistrationSeed(ctx, generated.UpdateRegistrationSeedParams{
		ID:   id,
		Seed: seed,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("update registration seed: %w", err)
	}
	return toRegistrationResponse(reg, true), nil
}

// UpdatePlacement updates a registration's final placement. The registration
// must belong to divisionID; otherwise a not-found error is returned.
func (s *RegistrationService) UpdatePlacement(ctx context.Context, divisionID, id int64, placement pgtype.Int4) (RegistrationResponse, error) {
	existing, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration for placement update: %w", err)
	}
	if existing.DivisionID != divisionID {
		return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
	}

	reg, err := s.queries.UpdateRegistrationPlacement(ctx, generated.UpdateRegistrationPlacementParams{
		ID:             id,
		FinalPlacement: placement,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("update registration placement: %w", err)
	}
	return toRegistrationResponse(reg, true), nil
}

// BulkNoShow marks the given registration IDs as no_show, scoped to the
// provided division. Passing an empty slice is a no-op (not an error).
// Registrations already in a terminal or checked-in state are skipped by the
// query itself.
func (s *RegistrationService) BulkNoShow(ctx context.Context, divisionID int64, registrationIDs []int64) error {
	if len(registrationIDs) == 0 {
		return &ValidationError{Message: "registration_ids must be a non-empty array"}
	}
	return s.queries.BulkUpdateNoShow(ctx, generated.BulkUpdateNoShowParams{
		DivisionID:      divisionID,
		RegistrationIds: registrationIDs,
	})
}

// ListSeekingPartner returns registrations that are seeking a partner.
// This is a public read path, so staff-only fields are always omitted.
func (s *RegistrationService) ListSeekingPartner(ctx context.Context, divisionID int64) ([]RegistrationResponse, error) {
	regs, err := s.queries.ListSeekingPartner(ctx, divisionID)
	if err != nil {
		return nil, fmt.Errorf("failed to list seeking partner: %w", err)
	}

	result := make([]RegistrationResponse, len(regs))
	for i, r := range regs {
		result[i] = toRegistrationResponse(r, false)
	}

	return result, nil
}

// CheckIn marks a registration as checked in. The registration must belong to
// divisionID; otherwise a not-found error is returned.
func (s *RegistrationService) CheckIn(ctx context.Context, divisionID, id int64) (RegistrationResponse, error) {
	reg, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration for check-in: %w", err)
	}
	if reg.DivisionID != divisionID {
		return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
	}

	if reg.Status != "approved" {
		return RegistrationResponse{}, &ValidationError{Message: "only approved registrations can check in"}
	}

	updated, err := s.queries.UpdateRegistrationStatus(ctx, generated.UpdateRegistrationStatusParams{
		ID:     id,
		Status: "checked_in",
	})
	if err != nil {
		return RegistrationResponse{}, fmt.Errorf("failed to check in: %w", err)
	}

	return toRegistrationResponse(updated, true), nil
}

// WithdrawMidTournament withdraws a registration mid-tournament. The
// registration must belong to divisionID; otherwise a not-found error is returned.
func (s *RegistrationService) WithdrawMidTournament(ctx context.Context, divisionID, id int64) (RegistrationResponse, error) {
	reg, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration for withdrawal: %w", err)
	}
	if reg.DivisionID != divisionID {
		return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
	}

	if reg.Status != "checked_in" && reg.Status != "approved" {
		return RegistrationResponse{}, &ValidationError{Message: "only approved or checked-in registrations can withdraw mid-tournament"}
	}

	updated, err := s.queries.UpdateRegistrationStatus(ctx, generated.UpdateRegistrationStatusParams{
		ID:     id,
		Status: "withdrawn_mid_tournament",
	})
	if err != nil {
		return RegistrationResponse{}, fmt.Errorf("failed to withdraw: %w", err)
	}

	return toRegistrationResponse(updated, true), nil
}

// UpdateAdminNotes updates the admin notes on a registration. The registration
// must belong to divisionID; otherwise a not-found error is returned.
func (s *RegistrationService) UpdateAdminNotes(ctx context.Context, divisionID, id int64, notes *string) (RegistrationResponse, error) {
	existing, err := s.queries.GetRegistrationByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("get registration for admin notes update: %w", err)
	}
	if existing.DivisionID != divisionID {
		return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
	}

	updated, err := s.queries.UpdateRegistrationAdminNotes(ctx, generated.UpdateRegistrationAdminNotesParams{
		ID:         id,
		AdminNotes: notes,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RegistrationResponse{}, &NotFoundError{Message: "registration not found"}
		}
		return RegistrationResponse{}, fmt.Errorf("update registration admin notes: %w", err)
	}

	return toRegistrationResponse(updated, true), nil
}
