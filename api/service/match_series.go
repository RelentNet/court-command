package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/pubsub"
)

// MatchSeriesService handles match series (MLP-style best-of-N) business logic.
type MatchSeriesService struct {
	queries *generated.Queries
	pool    *pgxpool.Pool
	ps      *pubsub.PubSub
}

// NewMatchSeriesService creates a new MatchSeriesService.
func NewMatchSeriesService(queries *generated.Queries, pool *pgxpool.Pool, ps *pubsub.PubSub) *MatchSeriesService {
	return &MatchSeriesService{queries: queries, pool: pool, ps: ps}
}

// MatchSeriesResponse is the public representation of a match series.
// Team1 and Team2 nested objects are populated on the single-series endpoints
// (Get, GetByPublicID). List endpoints leave them nil to avoid N+1.
type MatchSeriesResponse struct {
	ID              int64           `json:"id"`
	PublicID        string          `json:"public_id"`
	DivisionID      *int64          `json:"division_id,omitempty"`
	PodID           *int64          `json:"pod_id,omitempty"`
	CreatedByUserID int64           `json:"created_by_user_id"`
	Team1ID         *int64          `json:"team1_id,omitempty"`
	Team2ID         *int64          `json:"team2_id,omitempty"`
	Team1           *TeamSummary    `json:"team1"`
	Team2           *TeamSummary    `json:"team2"`
	SeriesFormat    string          `json:"series_format"`
	GamesToWin      int32           `json:"games_to_win"`
	SeriesConfig    json.RawMessage `json:"series_config"`
	Team1Wins       int32           `json:"team1_wins"`
	Team2Wins       int32           `json:"team2_wins"`
	Status          string          `json:"status"`
	StartedAt       *string         `json:"started_at,omitempty"`
	CompletedAt     *string         `json:"completed_at,omitempty"`
	WinnerTeamID    *int64          `json:"winner_team_id,omitempty"`
	LoserTeamID     *int64          `json:"loser_team_id,omitempty"`
	WinReason       *string         `json:"win_reason,omitempty"`
	Round           *int32          `json:"round,omitempty"`
	RoundName       *string         `json:"round_name,omitempty"`
	MatchNumber     *int32          `json:"match_number,omitempty"`
	CourtID         *int64          `json:"court_id,omitempty"`
	ScheduledAt     *string         `json:"scheduled_at,omitempty"`
	Notes           *string         `json:"notes,omitempty"`
	Matches         []MatchResponse `json:"matches"`
	CreatedAt       string          `json:"created_at"`
	UpdatedAt       string          `json:"updated_at"`
}

func toMatchSeriesResponse(ms generated.MatchSeries) MatchSeriesResponse {
	seriesConfig := json.RawMessage(ms.SeriesConfig)
	if len(seriesConfig) == 0 {
		seriesConfig = json.RawMessage("{}")
	}

	return MatchSeriesResponse{
		ID:              ms.ID,
		PublicID:        ms.PublicID,
		DivisionID:      optInt8(ms.DivisionID),
		PodID:           optInt8(ms.PodID),
		CreatedByUserID: ms.CreatedByUserID,
		Team1ID:         optInt8(ms.Team1ID),
		Team2ID:         optInt8(ms.Team2ID),
		SeriesFormat:    ms.SeriesFormat,
		GamesToWin:      ms.GamesToWin,
		SeriesConfig:    seriesConfig,
		Team1Wins:       ms.Team1Wins,
		Team2Wins:       ms.Team2Wins,
		Status:          ms.Status,
		StartedAt:       optTimestamptz(ms.StartedAt),
		CompletedAt:     optTimestamptz(ms.CompletedAt),
		WinnerTeamID:    optInt8(ms.WinnerTeamID),
		LoserTeamID:     optInt8(ms.LoserTeamID),
		WinReason:       ms.WinReason,
		Round:           optInt4(ms.Round),
		RoundName:       ms.RoundName,
		MatchNumber:     optInt4(ms.MatchNumber),
		CourtID:         optInt8(ms.CourtID),
		ScheduledAt:     optTimestamptz(ms.ScheduledAt),
		Notes:           ms.Notes,
		Matches:         make([]MatchResponse, 0),
		CreatedAt:       ms.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       ms.UpdatedAt.Format(time.RFC3339),
	}
}

// broadcastSeriesUpdate publishes a series update to relevant channels.
func (s *MatchSeriesService) broadcastSeriesUpdate(ctx context.Context, series generated.MatchSeries) {
	if s.ps == nil {
		return
	}
	resp := toMatchSeriesResponse(series)
	if series.DivisionID.Valid {
		s.ps.Publish(ctx, pubsub.DivisionChannel(series.DivisionID.Int64), "series_update", resp)
	}
	if series.CourtID.Valid {
		s.ps.Publish(ctx, pubsub.CourtChannel(series.CourtID.Int64), "series_update", resp)
	}
}

// CreateSeriesInput holds the input for creating a match series.
type CreateSeriesInput struct {
	DivisionID   *int64          `json:"division_id"`
	PodID        *int64          `json:"pod_id"`
	Team1ID      *int64          `json:"team1_id"`
	Team2ID      *int64          `json:"team2_id"`
	Format       string          `json:"series_format"`
	GamesToWin   int32           `json:"games_to_win"`
	SeriesConfig json.RawMessage `json:"series_config"`
	Round        *int32          `json:"round"`
	RoundName    *string         `json:"round_name"`
	MatchNumber  *int32          `json:"match_number"`
	CourtID      *int64          `json:"court_id"`
	ScheduledAt  *string         `json:"scheduled_at"`
	Notes        *string         `json:"notes"`
	// Scoring config for child matches
	GamesPerSet        int32  `json:"games_per_set"`
	SetsToWin          int32  `json:"sets_to_win"`
	PointsToWin        int32  `json:"points_to_win"`
	WinBy              int32  `json:"win_by"`
	MaxPoints          *int32 `json:"max_points"`
	RallyScoring       bool   `json:"rally_scoring"`
	TimeoutsPerGame    int32  `json:"timeouts_per_game"`
	TimeoutDurationSec int32  `json:"timeout_duration_sec"`
	FreezeAt           *int32 `json:"freeze_at"`
}

func toPgInt8(v *int64) pgtype.Int8 {
	if v == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

func toPgInt4(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}

// Create creates a new match series with validation.
func (s *MatchSeriesService) Create(ctx context.Context, userID int64, input CreateSeriesInput) (MatchSeriesResponse, error) {
	validFormats := map[string]bool{"best_of_3": true, "best_of_5": true, "best_of_7": true}
	if !validFormats[input.Format] {
		return MatchSeriesResponse{}, &ValidationError{Message: "series_format must be best_of_3, best_of_5, or best_of_7"}
	}
	if input.GamesToWin < 1 {
		return MatchSeriesResponse{}, &ValidationError{Message: "games_to_win must be at least 1"}
	}

	seriesConfig := input.SeriesConfig
	if len(seriesConfig) == 0 {
		seriesConfig = json.RawMessage("{}")
	}

	var scheduledAt pgtype.Timestamptz
	if input.ScheduledAt != nil {
		t, err := time.Parse(time.RFC3339, *input.ScheduledAt)
		if err == nil {
			scheduledAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	series, err := s.queries.CreateMatchSeries(ctx, generated.CreateMatchSeriesParams{
		DivisionID:      toPgInt8(input.DivisionID),
		PodID:           toPgInt8(input.PodID),
		CreatedByUserID: userID,
		Team1ID:         toPgInt8(input.Team1ID),
		Team2ID:         toPgInt8(input.Team2ID),
		SeriesFormat:    input.Format,
		GamesToWin:      input.GamesToWin,
		SeriesConfig:    seriesConfig,
		Status:          "pending",
		Round:           toPgInt4(input.Round),
		RoundName:       input.RoundName,
		MatchNumber:     toPgInt4(input.MatchNumber),
		CourtID:         toPgInt8(input.CourtID),
		ScheduledAt:     scheduledAt,
		Notes:           input.Notes,
	})
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to create match series: %w", err)
	}

	return toMatchSeriesResponse(series), nil
}

// loadTeamSummaryLite fetches a minimal TeamSummary (no roster) for use in
// MatchSeriesResponse enrichment. Returns nil on not-found or error so callers
// can just leave the field unset on the response.
func (s *MatchSeriesService) loadTeamSummaryLite(ctx context.Context, teamID int64) *TeamSummary {
	team, err := s.queries.GetTeamByID(ctx, teamID)
	if err != nil {
		return nil
	}
	return &TeamSummary{
		ID:           team.ID,
		Name:         team.Name,
		ShortName:    team.ShortName,
		PrimaryColor: team.PrimaryColor,
		LogoURL:      team.LogoUrl,
	}
}

// enrichSeriesResponse populates Team1/Team2 nested summaries and child matches.
// Best-effort: any failure leaves the field nil / empty rather than erroring.
func (s *MatchSeriesService) enrichSeriesResponse(ctx context.Context, series generated.MatchSeries) MatchSeriesResponse {
	resp := toMatchSeriesResponse(series)

	if series.Team1ID.Valid {
		resp.Team1 = s.loadTeamSummaryLite(ctx, series.Team1ID.Int64)
	}
	if series.Team2ID.Valid {
		resp.Team2 = s.loadTeamSummaryLite(ctx, series.Team2ID.Int64)
	}

	matches, err := s.queries.ListMatchesBySeriesID(ctx, pgtype.Int8{Int64: series.ID, Valid: true})
	if err == nil {
		for _, m := range matches {
			resp.Matches = append(resp.Matches, toMatchResponse(m))
		}
	}

	return resp
}

// Get returns a match series by ID with child matches + nested team summaries.
func (s *MatchSeriesService) Get(ctx context.Context, id int64) (MatchSeriesResponse, error) {
	series, err := s.queries.GetMatchSeries(ctx, id)
	if err != nil {
		return MatchSeriesResponse{}, &NotFoundError{Message: "match series not found"}
	}
	return s.enrichSeriesResponse(ctx, series), nil
}

// GetByPublicID returns a match series by public ID with child matches + nested team summaries.
func (s *MatchSeriesService) GetByPublicID(ctx context.Context, publicID string) (MatchSeriesResponse, error) {
	series, err := s.queries.GetMatchSeriesByPublicID(ctx, publicID)
	if err != nil {
		return MatchSeriesResponse{}, &NotFoundError{Message: "match series not found"}
	}
	return s.enrichSeriesResponse(ctx, series), nil
}

// ListByDivision returns paginated match series for a division.
func (s *MatchSeriesService) ListByDivision(ctx context.Context, divisionID int64, limit, offset int32) ([]MatchSeriesResponse, int64, error) {
	divID := pgtype.Int8{Int64: divisionID, Valid: true}

	series, err := s.queries.ListMatchSeriesByDivision(ctx, generated.ListMatchSeriesByDivisionParams{
		DivisionID: divID,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list match series: %w", err)
	}

	total, err := s.queries.CountMatchSeriesByDivision(ctx, divID)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count match series: %w", err)
	}

	results := make([]MatchSeriesResponse, 0, len(series))
	for _, ms := range series {
		results = append(results, toMatchSeriesResponse(ms))
	}

	return results, total, nil
}

// seriesConfigData represents the parsed series_config JSONB content.
type seriesConfigData struct {
	MatchTypes         []string `json:"match_types,omitempty"`
	DefaultGamesPerSet int32    `json:"default_games_per_set,omitempty"`
	DefaultSetsToWin   int32    `json:"default_sets_to_win,omitempty"`
	DefaultPointsToWin int32    `json:"default_points_to_win,omitempty"`
	DefaultWinBy       int32    `json:"default_win_by,omitempty"`
	DefaultRally       bool     `json:"default_rally_scoring,omitempty"`
}

// StartSeries transitions a series from pending to in_progress and auto-creates
// child matches based on series_config.match_types. If no match_types are specified,
// creates games_to_win * 2 - 1 child matches (maximum possible games).
func (s *MatchSeriesService) StartSeries(ctx context.Context, seriesID int64, userID int64) (MatchSeriesResponse, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	series, err := qtx.GetMatchSeriesForUpdate(ctx, seriesID)
	if err != nil {
		return MatchSeriesResponse{}, &NotFoundError{Message: "match series not found"}
	}

	if series.Status != "pending" {
		return MatchSeriesResponse{}, &ValidationError{Message: "series must be in pending status to start"}
	}

	// Parse series_config for match_types and default scoring
	var cfg seriesConfigData
	if len(series.SeriesConfig) > 0 {
		_ = json.Unmarshal(series.SeriesConfig, &cfg)
	}

	// Apply scoring defaults
	gamesPerSet := cfg.DefaultGamesPerSet
	if gamesPerSet < 1 {
		gamesPerSet = 1
	}
	setsToWin := cfg.DefaultSetsToWin
	if setsToWin < 1 {
		setsToWin = 1
	}
	pointsToWin := cfg.DefaultPointsToWin
	if pointsToWin < 1 {
		pointsToWin = 11
	}
	winBy := cfg.DefaultWinBy
	if winBy < 1 {
		winBy = 2
	}

	// Determine how many child matches to create
	matchCount := int32(0)
	if len(cfg.MatchTypes) > 0 {
		// MLP-style: one match per match type
		matchCount = int32(len(cfg.MatchTypes))
	} else {
		// Standard best-of-N: create the maximum possible matches
		// e.g., best_of_3 (games_to_win=2) → 3 matches, best_of_5 → 5
		matchCount = series.GamesToWin*2 - 1
	}

	// Create child matches
	createdMatches := make([]MatchResponse, 0, matchCount)
	for i := int32(0); i < matchCount; i++ {
		matchNum := i + 1
		match, err := qtx.CreateSeriesChildMatch(ctx, generated.CreateSeriesChildMatchParams{
			MatchSeriesID:      pgtype.Int8{Int64: seriesID, Valid: true},
			DivisionID:         series.DivisionID,
			PodID:              series.PodID,
			CreatedByUserID:    userID,
			MatchNumber:        pgtype.Int4{Int32: matchNum, Valid: true},
			Team1ID:            series.Team1ID,
			Team2ID:            series.Team2ID,
			GamesPerSet:        gamesPerSet,
			SetsToWin:          setsToWin,
			PointsToWin:        pointsToWin,
			WinBy:              winBy,
			MaxPoints:          pgtype.Int4{},
			RallyScoring:       cfg.DefaultRally,
			TimeoutsPerGame:    2,
			TimeoutDurationSec: 60,
			FreezeAt:           pgtype.Int4{},
		})
		if err != nil {
			return MatchSeriesResponse{}, fmt.Errorf("failed to create child match %d: %w", matchNum, err)
		}
		createdMatches = append(createdMatches, toMatchResponse(match))
	}

	updated, err := qtx.UpdateMatchSeriesStarted(ctx, seriesID)
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to start series: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	resp := toMatchSeriesResponse(updated)
	resp.Matches = createdMatches

	s.broadcastSeriesUpdate(ctx, updated)

	return resp, nil
}

// RecordMatchResult records the result of a child match and updates series score.
// Auto-completes the series when a team reaches the win threshold.
func (s *MatchSeriesService) RecordMatchResult(ctx context.Context, seriesID int64, matchID int64, winnerTeamID int64) (MatchSeriesResponse, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	series, err := qtx.GetMatchSeriesForUpdate(ctx, seriesID)
	if err != nil {
		return MatchSeriesResponse{}, &NotFoundError{Message: "match series not found"}
	}

	if series.Status != "in_progress" {
		return MatchSeriesResponse{}, &ValidationError{Message: "series must be in_progress to record results"}
	}

	// Validate the child match: it must exist, belong to THIS series, and be
	// completed. Without this, the matchID parameter was ignored entirely,
	// letting a caller record a result for a foreign or never-played match.
	childMatch, err := qtx.GetMatchForUpdate(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchSeriesResponse{}, &ValidationError{Message: "match not found"}
		}
		return MatchSeriesResponse{}, fmt.Errorf("get child match for series result: %w", err)
	}
	if !childMatch.MatchSeriesID.Valid || childMatch.MatchSeriesID.Int64 != seriesID {
		return MatchSeriesResponse{}, &ValidationError{Message: "match does not belong to this series"}
	}
	if childMatch.Status != "completed" {
		return MatchSeriesResponse{}, &ValidationError{Message: "child match must be completed to record its result"}
	}

	// Derive the winner from the child match's own recorded winner rather than
	// trusting the client-supplied winnerTeamID. The winner must still be one of
	// the series teams.
	if !childMatch.WinnerTeamID.Valid {
		return MatchSeriesResponse{}, &ValidationError{Message: "child match has no recorded winner"}
	}
	derivedWinner := childMatch.WinnerTeamID.Int64
	if (!series.Team1ID.Valid || derivedWinner != series.Team1ID.Int64) &&
		(!series.Team2ID.Valid || derivedWinner != series.Team2ID.Int64) {
		return MatchSeriesResponse{}, &ValidationError{Message: "winner must be one of the series teams"}
	}

	// Reconcile win counts by counting completed, series-linked child matches
	// per winning team. This is idempotent: replaying the same result (or a
	// previously counted match) cannot inflate a team's wins, because we recount
	// from the authoritative set of completed matches each time.
	childMatches, err := qtx.ListMatchesBySeriesID(ctx, pgtype.Int8{Int64: seriesID, Valid: true})
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("list series child matches: %w", err)
	}
	var team1Wins, team2Wins int32
	for _, cm := range childMatches {
		if cm.Status != "completed" || !cm.WinnerTeamID.Valid {
			continue
		}
		switch {
		case series.Team1ID.Valid && cm.WinnerTeamID.Int64 == series.Team1ID.Int64:
			team1Wins++
		case series.Team2ID.Valid && cm.WinnerTeamID.Int64 == series.Team2ID.Int64:
			team2Wins++
		}
	}

	_, err = qtx.UpdateMatchSeriesScore(ctx, generated.UpdateMatchSeriesScoreParams{
		ID:        seriesID,
		Team1Wins: team1Wins,
		Team2Wins: team2Wins,
	})
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to update series score: %w", err)
	}

	// Check if series is complete
	var updated generated.MatchSeries
	seriesComplete := false

	if team1Wins >= series.GamesToWin {
		// Team 1 wins the series
		var loserID pgtype.Int8
		if series.Team2ID.Valid {
			loserID = series.Team2ID
		}
		reason := "score"
		updated, err = qtx.UpdateMatchSeriesResult(ctx, generated.UpdateMatchSeriesResultParams{
			ID:           seriesID,
			WinnerTeamID: series.Team1ID,
			LoserTeamID:  loserID,
			WinReason:    &reason,
		})
		if err != nil {
			return MatchSeriesResponse{}, fmt.Errorf("failed to complete series: %w", err)
		}
		seriesComplete = true
	} else if team2Wins >= series.GamesToWin {
		// Team 2 wins the series
		var loserID pgtype.Int8
		if series.Team1ID.Valid {
			loserID = series.Team1ID
		}
		reason := "score"
		updated, err = qtx.UpdateMatchSeriesResult(ctx, generated.UpdateMatchSeriesResultParams{
			ID:           seriesID,
			WinnerTeamID: series.Team2ID,
			LoserTeamID:  loserID,
			WinReason:    &reason,
		})
		if err != nil {
			return MatchSeriesResponse{}, fmt.Errorf("failed to complete series: %w", err)
		}
		seriesComplete = true
	} else {
		// Series continues — re-read after score update
		updated, err = qtx.GetMatchSeries(ctx, seriesID)
		if err != nil {
			return MatchSeriesResponse{}, fmt.Errorf("failed to read updated series: %w", err)
		}
	}

	// Cancel remaining scheduled child matches when series completes
	if seriesComplete {
		if err := qtx.CancelScheduledChildMatches(ctx, pgtype.Int8{Int64: seriesID, Valid: true}); err != nil {
			return MatchSeriesResponse{}, fmt.Errorf("failed to cancel remaining child matches: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.broadcastSeriesUpdate(ctx, updated)
	return toMatchSeriesResponse(updated), nil
}

// ForfeitSeries forfeits a series on behalf of a team.
// Uses a transaction to atomically forfeit the series and cancel remaining child matches.
func (s *MatchSeriesService) ForfeitSeries(ctx context.Context, seriesID int64, forfeitingTeamID int64) (MatchSeriesResponse, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	series, err := qtx.GetMatchSeriesForUpdate(ctx, seriesID)
	if err != nil {
		return MatchSeriesResponse{}, &NotFoundError{Message: "match series not found"}
	}

	if series.Status != "pending" && series.Status != "in_progress" {
		return MatchSeriesResponse{}, &ValidationError{Message: "series must be pending or in_progress to forfeit"}
	}

	// Determine winner/loser
	var winnerID, loserID pgtype.Int8
	if series.Team1ID.Valid && forfeitingTeamID == series.Team1ID.Int64 {
		winnerID = series.Team2ID
		loserID = series.Team1ID
	} else if series.Team2ID.Valid && forfeitingTeamID == series.Team2ID.Int64 {
		winnerID = series.Team1ID
		loserID = series.Team2ID
	} else {
		return MatchSeriesResponse{}, &ValidationError{Message: "forfeiting team must be one of the series teams"}
	}

	updated, err := qtx.UpdateMatchSeriesForfeited(ctx, generated.UpdateMatchSeriesForfeitedParams{
		ID:           seriesID,
		WinnerTeamID: winnerID,
		LoserTeamID:  loserID,
	})
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to forfeit series: %w", err)
	}

	// Cancel remaining scheduled child matches
	if err := qtx.CancelScheduledChildMatches(ctx, pgtype.Int8{Int64: seriesID, Valid: true}); err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to cancel child matches: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to commit forfeit: %w", err)
	}

	s.broadcastSeriesUpdate(ctx, updated)
	return toMatchSeriesResponse(updated), nil
}

// CancelSeries cancels a pending or in-progress series.
// Uses a transaction to atomically cancel the series and its remaining child matches.
func (s *MatchSeriesService) CancelSeries(ctx context.Context, seriesID int64) (MatchSeriesResponse, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	series, err := qtx.GetMatchSeriesForUpdate(ctx, seriesID)
	if err != nil {
		return MatchSeriesResponse{}, &NotFoundError{Message: "match series not found"}
	}

	if series.Status != "pending" && series.Status != "in_progress" {
		return MatchSeriesResponse{}, &ValidationError{Message: "series must be pending or in_progress to cancel"}
	}

	updated, err := qtx.UpdateMatchSeriesStatus(ctx, generated.UpdateMatchSeriesStatusParams{
		ID:     seriesID,
		Status: "cancelled",
	})
	if err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to cancel series: %w", err)
	}

	// Cancel remaining scheduled child matches
	if err := qtx.CancelScheduledChildMatches(ctx, pgtype.Int8{Int64: seriesID, Valid: true}); err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to cancel child matches: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return MatchSeriesResponse{}, fmt.Errorf("failed to commit cancellation: %w", err)
	}

	s.broadcastSeriesUpdate(ctx, updated)
	return toMatchSeriesResponse(updated), nil
}

// CreateChildMatch creates a new child match within a series.
func (s *MatchSeriesService) CreateChildMatch(ctx context.Context, seriesID int64, userID int64, input CreateSeriesInput) (MatchResponse, error) {
	series, err := s.queries.GetMatchSeries(ctx, seriesID)
	if err != nil {
		return MatchResponse{}, &NotFoundError{Message: "match series not found"}
	}

	if series.Status != "in_progress" {
		return MatchResponse{}, &ValidationError{Message: "series must be in_progress to create child matches"}
	}

	// Count existing child matches to determine match number
	count, err := s.queries.CountMatchesBySeriesID(ctx, pgtype.Int8{Int64: seriesID, Valid: true})
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to count series matches: %w", err)
	}
	matchNum := int32(count + 1)

	match, err := s.queries.CreateSeriesChildMatch(ctx, generated.CreateSeriesChildMatchParams{
		MatchSeriesID:      pgtype.Int8{Int64: seriesID, Valid: true},
		DivisionID:         series.DivisionID,
		PodID:              series.PodID,
		CreatedByUserID:    userID,
		MatchNumber:        pgtype.Int4{Int32: matchNum, Valid: true},
		Team1ID:            series.Team1ID,
		Team2ID:            series.Team2ID,
		GamesPerSet:        input.GamesPerSet,
		SetsToWin:          input.SetsToWin,
		PointsToWin:        input.PointsToWin,
		WinBy:              input.WinBy,
		MaxPoints:          toPgInt4(input.MaxPoints),
		RallyScoring:       input.RallyScoring,
		TimeoutsPerGame:    input.TimeoutsPerGame,
		TimeoutDurationSec: input.TimeoutDurationSec,
		FreezeAt:           toPgInt4(input.FreezeAt),
	})
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to create child match: %w", err)
	}

	return toMatchResponse(match), nil
}
