package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/court-command/court-command/db/generated"
	"github.com/jackc/pgx/v5/pgtype"
)

// StandingsService handles standings computation and retrieval.
type StandingsService struct {
	queries *generated.Queries
}

// NewStandingsService creates a new StandingsService.
func NewStandingsService(queries *generated.Queries) *StandingsService {
	return &StandingsService{queries: queries}
}

// ---------- Response types ----------

// StandingsEntryResponse is the public representation of a standings entry.
type StandingsEntryResponse struct {
	ID                int64   `json:"id"`
	SeasonID          int64   `json:"season_id"`
	DivisionID        int64   `json:"division_id"`
	TeamID            int64   `json:"team_id"`
	Wins              int32   `json:"wins"`
	Losses            int32   `json:"losses"`
	Draws             int32   `json:"draws"`
	PointsFor         int32   `json:"points_for"`
	PointsAgainst     int32   `json:"points_against"`
	PointDifferential int32   `json:"point_differential"`
	MatchesPlayed     int32   `json:"matches_played"`
	StandingPoints    int32   `json:"standing_points"`
	OverridePoints    *int32  `json:"override_points,omitempty"`
	OverrideReason    *string `json:"override_reason,omitempty"`
	IsWithdrawn       bool    `json:"is_withdrawn"`
	WithdrawnAt       *string `json:"withdrawn_at,omitempty"`
	Rank              int32   `json:"rank"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

func toStandingsEntryResponse(e generated.StandingsEntry) StandingsEntryResponse {
	resp := StandingsEntryResponse{
		ID:                e.ID,
		SeasonID:          e.SeasonID,
		DivisionID:        e.DivisionID,
		TeamID:            e.TeamID,
		Wins:              e.Wins,
		Losses:            e.Losses,
		Draws:             e.Draws,
		PointsFor:         e.PointsFor,
		PointsAgainst:     e.PointsAgainst,
		PointDifferential: e.PointDifferential,
		MatchesPlayed:     e.MatchesPlayed,
		StandingPoints:    e.StandingPoints,
		OverrideReason:    e.OverrideReason,
		IsWithdrawn:       e.IsWithdrawn,
		Rank:              e.Rank,
		CreatedAt:         e.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         e.UpdatedAt.Format(time.RFC3339),
	}

	if e.OverridePoints.Valid {
		v := e.OverridePoints.Int32
		resp.OverridePoints = &v
	}
	if e.WithdrawnAt.Valid {
		t := e.WithdrawnAt.Time.Format(time.RFC3339)
		resp.WithdrawnAt = &t
	}

	return resp
}

// ---------- Standings config ----------

// StandingsConfig holds configurable weights for standings computation.
type StandingsConfig struct {
	WinPoints  int `json:"win_points"`
	LossPoints int `json:"loss_points"`
	DrawPoints int `json:"draw_points"`
}

// DefaultStandingsConfig returns the default config for a given method.
func DefaultStandingsConfig(method string) StandingsConfig {
	switch method {
	case "win_loss":
		return StandingsConfig{WinPoints: 1, LossPoints: 0, DrawPoints: 0}
	case "match_points":
		return StandingsConfig{WinPoints: 3, LossPoints: 0, DrawPoints: 1}
	default: // placement_points
		return StandingsConfig{WinPoints: 2, LossPoints: 0, DrawPoints: 1}
	}
}

// ---------- Intermediate computation types ----------

// teamStats accumulates stats for a single team during recompute.
type teamStats struct {
	TeamID         int64
	Wins           int32
	Losses         int32
	Draws          int32
	PointsFor      int32
	PointsAgainst  int32
	MatchesPlayed  int32
	StandingPoints int32

	// Admin adjustments carried over from the existing standings entry so that
	// ranking honors them. OverridePoints, when set, replaces StandingPoints as
	// the ranking key; IsWithdrawn teams are sorted to the bottom.
	OverridePoints *int32
	IsWithdrawn    bool
}

// rankingPoints returns the points value used to order standings, honoring an
// admin override when present.
func (t teamStats) rankingPoints() int32 {
	if t.OverridePoints != nil {
		return *t.OverridePoints
	}
	return t.StandingPoints
}

// ---------- Recompute ----------

// RecomputeStandings recalculates standings for a division within a season.
// It reads all completed matches for each registered team, computes stats,
// ranks entries, and upserts them into standings_entries.
func (svc *StandingsService) RecomputeStandings(ctx context.Context, seasonID, divisionID int64) ([]StandingsEntryResponse, error) {
	// 1. Validate season exists and get standings config
	season, err := svc.queries.GetSeasonByID(ctx, seasonID)
	if err != nil {
		return nil, &NotFoundError{Message: "season not found"}
	}

	// Verify the division actually belongs to this season via its tournament,
	// mirroring the canonical derivation used by the public standings read path
	// (division -> tournament -> tournament.season_id). Without this, a mismatched
	// (season, division) pair would upsert incoherent standings_entries rows.
	division, err := svc.queries.GetDivisionByID(ctx, divisionID)
	if err != nil {
		return nil, &NotFoundError{Message: "division not found"}
	}
	tournament, err := svc.queries.GetTournamentByID(ctx, division.TournamentID)
	if err != nil {
		return nil, &NotFoundError{Message: "tournament not found"}
	}
	if !tournament.SeasonID.Valid || tournament.SeasonID.Int64 != seasonID {
		return nil, &ValidationError{Message: "division does not belong to this season"}
	}

	method := "placement_points"
	if season.StandingsMethod != nil && *season.StandingsMethod != "" {
		method = *season.StandingsMethod
	}

	cfg := DefaultStandingsConfig(method)
	if len(season.StandingsConfig) > 0 && string(season.StandingsConfig) != "{}" {
		if err := json.Unmarshal(season.StandingsConfig, &cfg); err != nil {
			slog.Warn("standings: failed to parse standings_config, using defaults",
				"season_id", seasonID, "method", method, "error", err)
		}
	}

	// 2. Get all approved registrations for this division to find teams
	regs, err := svc.queries.ListRegistrationsByDivisionAndStatus(ctx, generated.ListRegistrationsByDivisionAndStatusParams{
		DivisionID: divisionID,
		Status:     "approved",
		Limit:      1000,
		Offset:     0,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list registrations: %w", err)
	}

	// Also include checked-in teams
	checkedIn, err := svc.queries.ListRegistrationsByDivisionAndStatus(ctx, generated.ListRegistrationsByDivisionAndStatusParams{
		DivisionID: divisionID,
		Status:     "checked_in",
		Limit:      1000,
		Offset:     0,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list checked-in registrations: %w", err)
	}
	regs = append(regs, checkedIn...)

	// Build set of team IDs from registrations (team-based registrations only)
	teamSet := make(map[int64]bool)
	for _, reg := range regs {
		if reg.TeamID.Valid {
			teamSet[reg.TeamID.Int64] = true
		}
	}

	if len(teamSet) == 0 {
		return []StandingsEntryResponse{}, nil
	}

	// Load existing standings entries so admin adjustments (override_points,
	// is_withdrawn) are honored when ranking. UpsertStandingsEntry preserves
	// these columns in the DB, but ranking must read them or the recomputed
	// rank would contradict the override/withdrawal.
	existing, err := svc.queries.ListStandingsByDivision(ctx, generated.ListStandingsByDivisionParams{
		SeasonID:   seasonID,
		DivisionID: divisionID,
		Limit:      1000,
		Offset:     0,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list existing standings: %w", err)
	}
	existingByTeam := make(map[int64]generated.StandingsEntry, len(existing))
	for _, e := range existing {
		existingByTeam[e.TeamID] = e
	}

	// 3. For each team, fetch completed matches and compute stats
	allStats := make([]teamStats, 0, len(teamSet))

	for teamID := range teamSet {
		matches, err := svc.queries.ListMatchesByTeamInDivision(ctx, generated.ListMatchesByTeamInDivisionParams{
			DivisionID: pgtype.Int8{Int64: divisionID, Valid: true},
			TeamID:     pgtype.Int8{Int64: teamID, Valid: true},
		})
		if err != nil {
			return nil, fmt.Errorf("failed to list matches for team %d: %w", teamID, err)
		}

		stats := teamStats{TeamID: teamID}

		for _, m := range matches {
			if m.Status != "completed" && m.Status != "forfeited" {
				continue
			}

			stats.MatchesPlayed++

			// Determine which side this team was on and accumulate scores
			isTeam1 := m.Team1ID.Valid && m.Team1ID.Int64 == teamID

			if isTeam1 {
				stats.PointsFor += m.Team1Score
				stats.PointsAgainst += m.Team2Score
			} else {
				stats.PointsFor += m.Team2Score
				stats.PointsAgainst += m.Team1Score
			}

			// Determine win/loss/draw
			if m.WinnerTeamID.Valid && m.WinnerTeamID.Int64 == teamID {
				stats.Wins++
				stats.StandingPoints += int32(cfg.WinPoints)
			} else if m.LoserTeamID.Valid && m.LoserTeamID.Int64 == teamID {
				stats.Losses++
				stats.StandingPoints += int32(cfg.LossPoints)
			} else {
				// Draw (no winner set on a completed match)
				stats.Draws++
				stats.StandingPoints += int32(cfg.DrawPoints)
			}
		}

		// Carry over admin adjustments from the existing entry so ranking honors them.
		if prev, ok := existingByTeam[teamID]; ok {
			stats.IsWithdrawn = prev.IsWithdrawn
			if prev.OverridePoints.Valid {
				v := prev.OverridePoints.Int32
				stats.OverridePoints = &v
			}
		}

		allStats = append(allStats, stats)
	}

	// 4. Sort withdrawn teams to the bottom, then by effective ranking points
	// (override when set, else standing_points) DESC, then point_differential
	// DESC, then wins DESC.
	sort.Slice(allStats, func(i, j int) bool {
		if allStats[i].IsWithdrawn != allStats[j].IsWithdrawn {
			// Active teams (not withdrawn) rank ahead of withdrawn teams.
			return !allStats[i].IsWithdrawn
		}
		ptsI := allStats[i].rankingPoints()
		ptsJ := allStats[j].rankingPoints()
		if ptsI != ptsJ {
			return ptsI > ptsJ
		}
		diffI := allStats[i].PointsFor - allStats[i].PointsAgainst
		diffJ := allStats[j].PointsFor - allStats[j].PointsAgainst
		if diffI != diffJ {
			return diffI > diffJ
		}
		return allStats[i].Wins > allStats[j].Wins
	})

	// 5. Upsert each entry with computed rank
	results := make([]StandingsEntryResponse, 0, len(allStats))

	for idx, s := range allStats {
		rank := int32(idx + 1)
		pointDiff := s.PointsFor - s.PointsAgainst

		entry, err := svc.queries.UpsertStandingsEntry(ctx, generated.UpsertStandingsEntryParams{
			SeasonID:          seasonID,
			DivisionID:        divisionID,
			TeamID:            s.TeamID,
			Wins:              s.Wins,
			Losses:            s.Losses,
			Draws:             s.Draws,
			PointsFor:         s.PointsFor,
			PointsAgainst:     s.PointsAgainst,
			PointDifferential: pointDiff,
			MatchesPlayed:     s.MatchesPlayed,
			StandingPoints:    s.StandingPoints,
			Rank:              rank,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to upsert standings for team %d: %w", s.TeamID, err)
		}

		results = append(results, toStandingsEntryResponse(entry))
	}

	return results, nil
}

// ---------- CRUD ----------

// ListBySeason returns all standings entries for a season, ordered by division_id and rank.
func (svc *StandingsService) ListBySeason(ctx context.Context, seasonID int64) ([]StandingsEntryResponse, error) {
	entries, err := svc.queries.ListStandingsBySeason(ctx, seasonID)
	if err != nil {
		return nil, fmt.Errorf("failed to list standings by season: %w", err)
	}

	results := make([]StandingsEntryResponse, len(entries))
	for i, e := range entries {
		results[i] = toStandingsEntryResponse(e)
	}

	return results, nil
}

// ListByDivision returns standings entries for a division within a season.
func (svc *StandingsService) ListByDivision(ctx context.Context, seasonID, divisionID int64, limit, offset int32) ([]StandingsEntryResponse, int64, error) {
	entries, err := svc.queries.ListStandingsByDivision(ctx, generated.ListStandingsByDivisionParams{
		SeasonID:   seasonID,
		DivisionID: divisionID,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list standings: %w", err)
	}

	count, err := svc.queries.CountStandingsByDivision(ctx, generated.CountStandingsByDivisionParams{
		SeasonID:   seasonID,
		DivisionID: divisionID,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count standings: %w", err)
	}

	results := make([]StandingsEntryResponse, len(entries))
	for i, e := range entries {
		results[i] = toStandingsEntryResponse(e)
	}

	return results, count, nil
}

// GetEntry returns a single standings entry.
func (svc *StandingsService) GetEntry(ctx context.Context, seasonID, divisionID, teamID int64) (StandingsEntryResponse, error) {
	entry, err := svc.queries.GetStandingsEntry(ctx, generated.GetStandingsEntryParams{
		SeasonID:   seasonID,
		DivisionID: divisionID,
		TeamID:     teamID,
	})
	if err != nil {
		return StandingsEntryResponse{}, &NotFoundError{Message: "standings entry not found"}
	}

	return toStandingsEntryResponse(entry), nil
}

// UpdateOverride sets an admin points override on a standings entry.
func (svc *StandingsService) UpdateOverride(ctx context.Context, seasonID, divisionID, teamID int64, points int32, reason *string) (StandingsEntryResponse, error) {
	entry, err := svc.queries.UpdateStandingsOverride(ctx, generated.UpdateStandingsOverrideParams{
		SeasonID:       seasonID,
		DivisionID:     divisionID,
		TeamID:         teamID,
		OverridePoints: pgtype.Int4{Int32: points, Valid: true},
		OverrideReason: reason,
	})
	if err != nil {
		return StandingsEntryResponse{}, &NotFoundError{Message: "standings entry not found"}
	}

	return toStandingsEntryResponse(entry), nil
}

// ClearOverride removes the admin points override from a standings entry.
func (svc *StandingsService) ClearOverride(ctx context.Context, seasonID, divisionID, teamID int64) (StandingsEntryResponse, error) {
	entry, err := svc.queries.ClearStandingsOverride(ctx, generated.ClearStandingsOverrideParams{
		SeasonID:   seasonID,
		DivisionID: divisionID,
		TeamID:     teamID,
	})
	if err != nil {
		return StandingsEntryResponse{}, &NotFoundError{Message: "standings entry not found"}
	}

	return toStandingsEntryResponse(entry), nil
}

// MarkWithdrawn marks a team as withdrawn in the standings.
func (svc *StandingsService) MarkWithdrawn(ctx context.Context, seasonID, divisionID, teamID int64) (StandingsEntryResponse, error) {
	entry, err := svc.queries.MarkTeamWithdrawn(ctx, generated.MarkTeamWithdrawnParams{
		SeasonID:   seasonID,
		DivisionID: divisionID,
		TeamID:     teamID,
	})
	if err != nil {
		return StandingsEntryResponse{}, &NotFoundError{Message: "standings entry not found"}
	}

	return toStandingsEntryResponse(entry), nil
}
