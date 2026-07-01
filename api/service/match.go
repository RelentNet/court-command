package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/court-command/court-command/db/generated"
	"github.com/court-command/court-command/engine"
	"github.com/court-command/court-command/pubsub"
)

// MatchService handles match business logic.
type MatchService struct {
	queries *generated.Queries
	pool    *pgxpool.Pool
	ps      *pubsub.PubSub
	logger  *slog.Logger
}

// NewMatchService creates a new MatchService.
//
// logger may be nil; a slog.Default() logger is substituted. The logger is
// used to report best-effort enrichment failures in enrichedMatchResponse
// that would otherwise manifest as silently missing response fields (CR-5).
func NewMatchService(queries *generated.Queries, pool *pgxpool.Pool, ps *pubsub.PubSub, logger *slog.Logger) *MatchService {
	if logger == nil {
		logger = slog.Default()
	}
	return &MatchService{queries: queries, pool: pool, ps: ps, logger: logger}
}

// broadcastMatchUpdate publishes a match update to all relevant channels.
// Handles pgtype.Int8 → *int64 conversion for courtID and divisionID.
// Silently skips if pub/sub is not configured (ps == nil).
//
// Callers MUST pass an already-enriched MatchResponse. This avoids a second
// round of enrichment (~10 DB round-trips per scoring point) inside the
// scoring hot path. See Phase 3 review defect CR-4.
func (s *MatchService) broadcastMatchUpdate(ctx context.Context, match generated.Match, resp MatchResponse) {
	if s.ps == nil {
		return
	}
	s.ps.PublishMatchUpdate(ctx, match.PublicID, optInt8(match.CourtID), optInt8(match.DivisionID), resp)
}

// ScoreSnapshot holds the denormalized score state captured with each
// match event. Frontend reads this as `event.score_snapshot` — see CR-2 in
// docs/superpowers/lessons/2026-04-16-phase-3-review-defects.md.
type ScoreSnapshot struct {
	Team1Score   int32           `json:"team_1_score"`
	Team2Score   int32           `json:"team_2_score"`
	CurrentSet   int32           `json:"current_set"`
	CurrentGame  int32           `json:"current_game"`
	ServingTeam  *int32          `json:"serving_team"`
	ServerNumber *int32          `json:"server_number"`
	SetScores    json.RawMessage `json:"set_scores"`
}

// PlayerSummary is a lightweight roster entry embedded inside a MatchTeam.
type PlayerSummary struct {
	ID          int64   `json:"id"`
	PublicID    string  `json:"public_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

// TeamSummary is the nested team shape embedded in MatchResponse.
// Matches the frontend MatchTeam interface (see web/src/features/scoring/types.ts).
type TeamSummary struct {
	ID           int64           `json:"id"`
	Name         string          `json:"name"`
	ShortName    string          `json:"short_name,omitempty"`
	PrimaryColor *string         `json:"primary_color,omitempty"`
	LogoURL      *string         `json:"logo_url,omitempty"`
	Players      []PlayerSummary `json:"players,omitempty"`
}

// MatchResponse is the public representation of a match.
// JSON field names mirror web/src/features/scoring/types.ts#Match.
type MatchResponse struct {
	ID                 int64           `json:"id"`
	PublicID           string          `json:"public_id"`
	TournamentID       *int64          `json:"tournament_id,omitempty"`
	TournamentName     *string         `json:"tournament_name,omitempty"`
	DivisionID         *int64          `json:"division_id,omitempty"`
	DivisionName       *string         `json:"division_name,omitempty"`
	PodID              *int64          `json:"pod_id,omitempty"`
	CourtID            *int64          `json:"court_id,omitempty"`
	CourtName          *string         `json:"court_name,omitempty"`
	MatchSeriesID      *int64          `json:"match_series_id,omitempty"`
	CreatedByUserID    int64           `json:"created_by_user_id"`
	MatchType          string          `json:"match_type"`
	IsQuickMatch       bool            `json:"is_quick_match"`
	Round              *int32          `json:"round,omitempty"`
	RoundName          *string         `json:"round_name,omitempty"`
	MatchNumber        *int32          `json:"match_number,omitempty"`
	Team1ID            *int64          `json:"team_1_id,omitempty"`
	Team2ID            *int64          `json:"team_2_id,omitempty"`
	Team1              *TeamSummary    `json:"team_1"`
	Team2              *TeamSummary    `json:"team_2"`
	Team1Seed          *int32          `json:"team_1_seed,omitempty"`
	Team2Seed          *int32          `json:"team_2_seed,omitempty"`
	ScoringPresetID    *int64          `json:"scoring_preset_id,omitempty"`
	ScoringType        string          `json:"scoring_type"`
	GamesPerSet        int32           `json:"games_per_set"`
	SetsToWin          int32           `json:"sets_to_win"`
	BestOf             int32           `json:"best_of"`
	PointsToWin        int32           `json:"points_to_win"`
	WinBy              int32           `json:"win_by"`
	MaxPoints          *int32          `json:"max_points,omitempty"`
	RallyScoring       bool            `json:"rally_scoring"`
	TimeoutsPerGame    int32           `json:"timeouts_per_game"`
	TimeoutDurationSec int32           `json:"timeout_duration_sec"`
	FreezeAt           *int32          `json:"freeze_at,omitempty"`
	Team1Score         int32           `json:"team_1_score"`
	Team2Score         int32           `json:"team_2_score"`
	Team1GamesWon      int32           `json:"team_1_games_won"`
	Team2GamesWon      int32           `json:"team_2_games_won"`
	Team1TimeoutsUsed  int32           `json:"team_1_timeouts_used"`
	Team2TimeoutsUsed  int32           `json:"team_2_timeouts_used"`
	CurrentSet         int32           `json:"current_set"`
	CurrentGame        int32           `json:"current_game"`
	ServingTeam        *int32          `json:"serving_team"`
	ServerNumber       *int32          `json:"server_number"`
	SetScores          json.RawMessage `json:"set_scores"`
	Status             string          `json:"status"`
	IsPaused           bool            `json:"is_paused"`
	StartedAt          *string         `json:"started_at,omitempty"`
	CompletedAt        *string         `json:"completed_at,omitempty"`
	WinnerTeamID       *int64          `json:"winner_team_id,omitempty"`
	LoserTeamID        *int64          `json:"loser_team_id,omitempty"`
	WinReason          *string         `json:"win_reason,omitempty"`
	NextMatchID        *int64          `json:"next_match_id,omitempty"`
	NextMatchSlot      *int32          `json:"next_match_slot,omitempty"`
	LoserNextMatchID   *int64          `json:"loser_next_match_id,omitempty"`
	LoserNextMatchSlot *int32          `json:"loser_next_match_slot,omitempty"`
	RefereeUserID      *int64          `json:"referee_user_id,omitempty"`
	Notes              *string         `json:"notes,omitempty"`
	ExpiresAt          *string         `json:"expires_at,omitempty"`
	ScheduledAt        *string         `json:"scheduled_at,omitempty"`
	CreatedAt          string          `json:"created_at"`
	UpdatedAt          string          `json:"updated_at"`
}

// MatchEventResponse is the public representation of a match event.
// Shape is stable; frontend reads `timestamp` (alias for created_at) and
// `score_snapshot` (nested group). See CR-2 in
// docs/superpowers/lessons/2026-04-16-phase-3-review-defects.md.
type MatchEventResponse struct {
	ID              int64           `json:"id"`
	MatchID         int64           `json:"match_id"`
	SequenceID      int32           `json:"sequence_id"`
	EventType       string          `json:"event_type"`
	ScoreSnapshot   ScoreSnapshot   `json:"score_snapshot"`
	Payload         json.RawMessage `json:"payload"`
	CreatedByUserID *int64          `json:"created_by_user_id,omitempty"`
	// Timestamp is the canonical event time the frontend reads.
	// CreatedAt is retained as an alias for legacy consumers.
	Timestamp string `json:"timestamp"`
	CreatedAt string `json:"created_at"`
}

func optInt8(v pgtype.Int8) *int64 {
	if v.Valid {
		return &v.Int64
	}
	return nil
}

func optInt4(v pgtype.Int4) *int32 {
	if v.Valid {
		return &v.Int32
	}
	return nil
}

func optTimestamptz(v pgtype.Timestamptz) *string {
	if v.Valid {
		s := v.Time.Format(time.RFC3339)
		return &s
	}
	return nil
}

func toMatchResponse(m generated.Match) MatchResponse {
	scoringType := "side_out"
	if m.RallyScoring {
		scoringType = "rally"
	}

	bestOf := m.SetsToWin*2 - 1
	if bestOf < 1 {
		bestOf = 1
	}

	resp := MatchResponse{
		ID:                 m.ID,
		PublicID:           m.PublicID,
		TournamentID:       optInt8(m.TournamentID),
		DivisionID:         optInt8(m.DivisionID),
		PodID:              optInt8(m.PodID),
		CourtID:            optInt8(m.CourtID),
		MatchSeriesID:      optInt8(m.MatchSeriesID),
		CreatedByUserID:    m.CreatedByUserID,
		MatchType:          m.MatchType,
		IsQuickMatch:       m.MatchType == "quick",
		Round:              optInt4(m.Round),
		RoundName:          m.RoundName,
		MatchNumber:        optInt4(m.MatchNumber),
		Team1ID:            optInt8(m.Team1ID),
		Team2ID:            optInt8(m.Team2ID),
		Team1Seed:          optInt4(m.Team1Seed),
		Team2Seed:          optInt4(m.Team2Seed),
		ScoringPresetID:    optInt8(m.ScoringPresetID),
		ScoringType:        scoringType,
		GamesPerSet:        m.GamesPerSet,
		SetsToWin:          m.SetsToWin,
		BestOf:             bestOf,
		PointsToWin:        m.PointsToWin,
		WinBy:              m.WinBy,
		MaxPoints:          optInt4(m.MaxPoints),
		RallyScoring:       m.RallyScoring,
		TimeoutsPerGame:    m.TimeoutsPerGame,
		TimeoutDurationSec: m.TimeoutDurationSec,
		FreezeAt:           optInt4(m.FreezeAt),
		Team1Score:         m.Team1Score,
		Team2Score:         m.Team2Score,
		CurrentSet:         m.CurrentSet,
		CurrentGame:        m.CurrentGame,
		ServingTeam:        optInt4(m.ServingTeam),
		ServerNumber:       optInt4(m.ServerNumber),
		Status:             m.Status,
		IsPaused:           m.Status == "paused",
		StartedAt:          optTimestamptz(m.StartedAt),
		CompletedAt:        optTimestamptz(m.CompletedAt),
		WinnerTeamID:       optInt8(m.WinnerTeamID),
		LoserTeamID:        optInt8(m.LoserTeamID),
		WinReason:          m.WinReason,
		NextMatchID:        optInt8(m.NextMatchID),
		NextMatchSlot:      optInt4(m.NextMatchSlot),
		LoserNextMatchID:   optInt8(m.LoserNextMatchID),
		LoserNextMatchSlot: optInt4(m.LoserNextMatchSlot),
		RefereeUserID:      optInt8(m.RefereeUserID),
		Notes:              m.Notes,
		ExpiresAt:          optTimestamptz(m.ExpiresAt),
		ScheduledAt:        optTimestamptz(m.ScheduledAt),
		CreatedAt:          m.CreatedAt.Format(time.RFC3339),
		UpdatedAt:          m.UpdatedAt.Format(time.RFC3339),
	}

	if len(m.SetScores) > 0 {
		resp.SetScores = json.RawMessage(m.SetScores)
		// Derive games-won from completed sets.
		var games []engine.GameResult
		if err := json.Unmarshal(m.SetScores, &games); err == nil {
			for _, g := range games {
				switch g.Winner {
				case 1:
					resp.Team1GamesWon++
				case 2:
					resp.Team2GamesWon++
				}
			}
		}
	} else {
		resp.SetScores = json.RawMessage("[]")
	}

	return resp
}

// enrichedMatchResponse builds a MatchResponse enriched with nested teams
// (with roster), division/tournament/court names, and timeouts-used counts.
//
// Best-effort: any sub-fetch failure logs via s.logger.Warn and leaves the
// corresponding response field at its zero value rather than failing the
// whole response. Callers that need the flat shape only should call
// toMatchResponse directly.
//
// pgx.ErrNoRows is treated as an expected absence (FK pointing at a row that
// has since been deleted, for example) and is NOT logged. All other errors
// — connection loss, permission change, schema drift, malformed payloads —
// log a Warn with the match id and the field that failed to enrich. See
// CR-5 in docs/superpowers/lessons/2026-04-16-phase-3-review-defects.md.
func (s *MatchService) enrichedMatchResponse(ctx context.Context, m generated.Match) MatchResponse {
	resp := toMatchResponse(m)

	// Nested team summaries (name/colors/roster).
	if m.Team1ID.Valid {
		if t, err := s.loadTeamSummary(ctx, m.Team1ID.Int64); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.logger.Warn("match enrichment failed",
					"match_id", m.ID,
					"field", "team1",
					"team_id", m.Team1ID.Int64,
					"error", err)
			}
		} else {
			resp.Team1 = t
		}
	}
	if m.Team2ID.Valid {
		if t, err := s.loadTeamSummary(ctx, m.Team2ID.Int64); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.logger.Warn("match enrichment failed",
					"match_id", m.ID,
					"field", "team2",
					"team_id", m.Team2ID.Int64,
					"error", err)
			}
		} else {
			resp.Team2 = t
		}
	}

	// Division name.
	if m.DivisionID.Valid {
		if d, err := s.queries.GetDivisionByID(ctx, m.DivisionID.Int64); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.logger.Warn("match enrichment failed",
					"match_id", m.ID,
					"field", "division",
					"division_id", m.DivisionID.Int64,
					"error", err)
			}
		} else {
			name := d.Name
			resp.DivisionName = &name
		}
	}

	// Tournament name.
	if m.TournamentID.Valid {
		if t, err := s.queries.GetTournamentByID(ctx, m.TournamentID.Int64); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.logger.Warn("match enrichment failed",
					"match_id", m.ID,
					"field", "tournament",
					"tournament_id", m.TournamentID.Int64,
					"error", err)
			}
		} else {
			name := t.Name
			resp.TournamentName = &name
		}
	}

	// Court name.
	if m.CourtID.Valid {
		if c, err := s.queries.GetCourtByID(ctx, m.CourtID.Int64); err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.logger.Warn("match enrichment failed",
					"match_id", m.ID,
					"field", "court",
					"court_id", m.CourtID.Int64,
					"error", err)
			}
		} else {
			name := c.Name
			resp.CourtName = &name
		}
	}

	// Timeouts used per team (count timeout events grouped by team payload).
	events, err := s.queries.ListMatchEventsByType(ctx, generated.ListMatchEventsByTypeParams{
		MatchID:   m.ID,
		EventType: EventTypeTimeout,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			s.logger.Warn("match enrichment failed",
				"match_id", m.ID,
				"field", "timeouts",
				"error", err)
		}
	} else {
		for _, ev := range events {
			if len(ev.Payload) == 0 {
				continue
			}
			var payload struct {
				Team int32 `json:"team"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err != nil {
				s.logger.Warn("match enrichment failed",
					"match_id", m.ID,
					"field", "timeouts",
					"event_id", ev.ID,
					"error", fmt.Errorf("unmarshal timeout payload: %w", err))
				continue
			}
			switch payload.Team {
			case 1:
				resp.Team1TimeoutsUsed++
			case 2:
				resp.Team2TimeoutsUsed++
			}
		}
	}

	return resp
}

// enrichMatchesBatch builds enriched MatchResponse slices for list endpoints
// using batch queries instead of per-match sub-queries. This reduces the
// query count from ~8N to a fixed 6 queries regardless of list size.
//
// Best-effort: any batch-fetch failure is logged and the corresponding fields
// are left at zero values, matching enrichedMatchResponse semantics.
func (s *MatchService) enrichMatchesBatch(ctx context.Context, matches []generated.Match) []MatchResponse {
	n := len(matches)
	if n == 0 {
		return []MatchResponse{}
	}

	// --- 1. Collect unique IDs ---------------------------------------------------
	matchIDs := make([]int64, n)
	teamIDSet := make(map[int64]bool)
	courtIDSet := make(map[int64]bool)
	divisionIDSet := make(map[int64]bool)
	tournamentIDSet := make(map[int64]bool)

	for i, m := range matches {
		matchIDs[i] = m.ID
		if m.Team1ID.Valid {
			teamIDSet[m.Team1ID.Int64] = true
		}
		if m.Team2ID.Valid {
			teamIDSet[m.Team2ID.Int64] = true
		}
		if m.CourtID.Valid {
			courtIDSet[m.CourtID.Int64] = true
		}
		if m.DivisionID.Valid {
			divisionIDSet[m.DivisionID.Int64] = true
		}
		if m.TournamentID.Valid {
			tournamentIDSet[m.TournamentID.Int64] = true
		}
	}

	teamIDs := setToSlice(teamIDSet)
	courtIDs := setToSlice(courtIDSet)
	divisionIDs := setToSlice(divisionIDSet)
	tournamentIDs := setToSlice(tournamentIDSet)

	// --- 2. Batch fetch (best-effort, each failure is independent) ---------------

	// Teams by ID → lookup map
	teamMap := make(map[int64]generated.Team)
	if len(teamIDs) > 0 {
		teams, err := s.queries.GetTeamsByIDs(ctx, teamIDs)
		if err != nil {
			s.logger.Warn("batch enrichment: GetTeamsByIDs failed", "error", err)
		} else {
			for _, t := range teams {
				teamMap[t.ID] = t
			}
		}
	}

	// Rosters by team ID → lookup map
	rosterMap := make(map[int64][]PlayerSummary)
	if len(teamIDs) > 0 {
		rosterRows, err := s.queries.GetActiveRostersByTeamIDs(ctx, teamIDs)
		if err != nil {
			s.logger.Warn("batch enrichment: GetActiveRostersByTeamIDs failed", "error", err)
		} else {
			for _, r := range rosterRows {
				display := ""
				if r.DisplayName != nil && *r.DisplayName != "" {
					display = *r.DisplayName
				} else {
					display = fmt.Sprintf("%s %s", r.FirstName, r.LastName)
				}
				rosterMap[r.TeamID] = append(rosterMap[r.TeamID], PlayerSummary{
					ID:          r.PlayerID,
					PublicID:    r.PublicID,
					DisplayName: display,
					AvatarURL:   r.AvatarUrl,
				})
			}
		}
	}

	// Courts by ID → name lookup
	courtNameMap := make(map[int64]string)
	if len(courtIDs) > 0 {
		courts, err := s.queries.GetCourtsByIDs(ctx, courtIDs)
		if err != nil {
			s.logger.Warn("batch enrichment: GetCourtsByIDs failed", "error", err)
		} else {
			for _, c := range courts {
				courtNameMap[c.ID] = c.Name
			}
		}
	}

	// Divisions by ID → name lookup
	divisionNameMap := make(map[int64]string)
	if len(divisionIDs) > 0 {
		divisions, err := s.queries.GetDivisionsByIDs(ctx, divisionIDs)
		if err != nil {
			s.logger.Warn("batch enrichment: GetDivisionsByIDs failed", "error", err)
		} else {
			for _, d := range divisions {
				divisionNameMap[d.ID] = d.Name
			}
		}
	}

	// Tournaments by ID → name lookup
	tournamentNameMap := make(map[int64]string)
	if len(tournamentIDs) > 0 {
		tournaments, err := s.queries.GetTournamentsByIDs(ctx, tournamentIDs)
		if err != nil {
			s.logger.Warn("batch enrichment: GetTournamentsByIDs failed", "error", err)
		} else {
			for _, t := range tournaments {
				tournamentNameMap[t.ID] = t.Name
			}
		}
	}

	// Timeout events by match ID → count per team
	type timeoutCounts struct {
		team1 int32
		team2 int32
	}
	timeoutMap := make(map[int64]timeoutCounts)
	if len(matchIDs) > 0 {
		events, err := s.queries.ListTimeoutEventsByMatchIDs(ctx, matchIDs)
		if err != nil {
			s.logger.Warn("batch enrichment: ListTimeoutEventsByMatchIDs failed", "error", err)
		} else {
			for _, ev := range events {
				if len(ev.Payload) == 0 {
					continue
				}
				var payload struct {
					Team int32 `json:"team"`
				}
				if err := json.Unmarshal(ev.Payload, &payload); err != nil {
					continue
				}
				tc := timeoutMap[ev.MatchID]
				switch payload.Team {
				case 1:
					tc.team1++
				case 2:
					tc.team2++
				}
				timeoutMap[ev.MatchID] = tc
			}
		}
	}

	// --- 3. Assemble responses from lookup maps ----------------------------------
	result := make([]MatchResponse, n)
	for i, m := range matches {
		resp := toMatchResponse(m)

		// Team 1
		if m.Team1ID.Valid {
			if t, ok := teamMap[m.Team1ID.Int64]; ok {
				summary := &TeamSummary{
					ID:           t.ID,
					Name:         t.Name,
					ShortName:    t.ShortName,
					PrimaryColor: t.PrimaryColor,
					LogoURL:      t.LogoUrl,
					Players:      rosterMap[t.ID],
				}
				resp.Team1 = summary
			}
		}

		// Team 2
		if m.Team2ID.Valid {
			if t, ok := teamMap[m.Team2ID.Int64]; ok {
				summary := &TeamSummary{
					ID:           t.ID,
					Name:         t.Name,
					ShortName:    t.ShortName,
					PrimaryColor: t.PrimaryColor,
					LogoURL:      t.LogoUrl,
					Players:      rosterMap[t.ID],
				}
				resp.Team2 = summary
			}
		}

		// Division name
		if m.DivisionID.Valid {
			if name, ok := divisionNameMap[m.DivisionID.Int64]; ok {
				resp.DivisionName = &name
			}
		}

		// Tournament name
		if m.TournamentID.Valid {
			if name, ok := tournamentNameMap[m.TournamentID.Int64]; ok {
				resp.TournamentName = &name
			}
		}

		// Court name
		if m.CourtID.Valid {
			if name, ok := courtNameMap[m.CourtID.Int64]; ok {
				resp.CourtName = &name
			}
		}

		// Timeouts used
		if tc, ok := timeoutMap[m.ID]; ok {
			resp.Team1TimeoutsUsed = tc.team1
			resp.Team2TimeoutsUsed = tc.team2
		}

		result[i] = resp
	}

	return result
}

// setToSlice converts a set (map[int64]bool) to a sorted slice.
func setToSlice(s map[int64]bool) []int64 {
	out := make([]int64, 0, len(s))
	for id := range s {
		out = append(out, id)
	}
	return out
}

// loadTeamSummary fetches a team plus its active roster and shapes the
// public summary. Returns (nil, err) when the team itself can't be loaded
// so callers can log with field-specific context. A missing roster is
// non-fatal and logged internally.
func (s *MatchService) loadTeamSummary(ctx context.Context, teamID int64) (*TeamSummary, error) {
	team, err := s.queries.GetTeamByID(ctx, teamID)
	if err != nil {
		return nil, err
	}
	summary := &TeamSummary{
		ID:           team.ID,
		Name:         team.Name,
		ShortName:    team.ShortName,
		PrimaryColor: team.PrimaryColor,
		LogoURL:      team.LogoUrl,
	}
	roster, err := s.queries.GetActiveRoster(ctx, teamID)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			s.logger.Warn("match enrichment failed",
				"field", "roster",
				"team_id", teamID,
				"error", err)
		}
		return summary, nil
	}
	players := make([]PlayerSummary, 0, len(roster))
	for _, r := range roster {
		display := ""
		if r.DisplayName != nil && *r.DisplayName != "" {
			display = *r.DisplayName
		} else {
			display = fmt.Sprintf("%s %s", r.FirstName, r.LastName)
		}
		players = append(players, PlayerSummary{
			ID:          r.PlayerID,
			PublicID:    r.PublicID,
			DisplayName: display,
			AvatarURL:   r.AvatarUrl,
		})
	}
	summary.Players = players
	return summary, nil
}

func toMatchEventResponse(e generated.MatchEvent) MatchEventResponse {
	ts := e.CreatedAt.Format(time.RFC3339)

	snap := ScoreSnapshot{
		Team1Score:   e.Team1Score,
		Team2Score:   e.Team2Score,
		CurrentSet:   e.CurrentSet,
		CurrentGame:  e.CurrentGame,
		ServingTeam:  optInt4(e.ServingTeam),
		ServerNumber: optInt4(e.ServerNumber),
	}
	if len(e.SetScores) > 0 {
		snap.SetScores = json.RawMessage(e.SetScores)
	} else {
		snap.SetScores = json.RawMessage("[]")
	}

	resp := MatchEventResponse{
		ID:              e.ID,
		MatchID:         e.MatchID,
		SequenceID:      e.SequenceID,
		EventType:       e.EventType,
		ScoreSnapshot:   snap,
		CreatedByUserID: optInt8(e.CreatedByUserID),
		Timestamp:       ts,
		CreatedAt:       ts,
	}

	if len(e.Payload) > 0 {
		resp.Payload = json.RawMessage(e.Payload)
	} else {
		resp.Payload = json.RawMessage("{}")
	}

	return resp
}

// validMatchTransitions defines allowed status transitions.
var validMatchTransitions = map[string][]string{
	"scheduled":   {"warmup", "in_progress", "cancelled"},
	"warmup":      {"in_progress", "cancelled"},
	"in_progress": {"paused", "completed", "cancelled", "forfeited"},
	"paused":      {"in_progress", "cancelled", "forfeited"},
}

// Create creates a new match.
func (s *MatchService) Create(ctx context.Context, params generated.CreateMatchParams) (MatchResponse, error) {
	if params.MatchType == "" {
		params.MatchType = "tournament"
	}

	validTypes := map[string]bool{
		"tournament": true, "quick": true, "pickup": true, "practice": true, "league": true,
	}
	if !validTypes[params.MatchType] {
		return MatchResponse{}, &ValidationError{Message: "invalid match_type"}
	}

	if params.Status == "" {
		params.Status = "scheduled"
	}

	match, err := s.queries.CreateMatch(ctx, params)
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to create match: %w", err)
	}

	return s.enrichedMatchResponse(ctx, match), nil
}

// GetByID retrieves a match by internal ID.
func (s *MatchService) GetByID(ctx context.Context, id int64) (MatchResponse, error) {
	match, err := s.queries.GetMatch(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("get match by id: %w", err)
	}
	return s.enrichedMatchResponse(ctx, match), nil
}

// GetByPublicID retrieves a match by public ID.
func (s *MatchService) GetByPublicID(ctx context.Context, publicID string) (MatchResponse, error) {
	match, err := s.queries.GetMatchByPublicID(ctx, publicID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("get match by public id: %w", err)
	}
	return s.enrichedMatchResponse(ctx, match), nil
}

// ListByDivision returns paginated matches for a division.
func (s *MatchService) ListByDivision(ctx context.Context, divisionID int64, limit, offset int32) ([]MatchResponse, int64, error) {
	did := pgtype.Int8{Int64: divisionID, Valid: true}
	matches, err := s.queries.ListMatchesByDivision(ctx, generated.ListMatchesByDivisionParams{
		DivisionID: did,
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list matches: %w", err)
	}

	count, err := s.queries.CountMatchesByDivision(ctx, did)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), count, nil
}

// ListByPod returns paginated matches for a pod.
func (s *MatchService) ListByPod(ctx context.Context, podID int64, limit, offset int32) ([]MatchResponse, error) {
	matches, err := s.queries.ListMatchesByPod(ctx, generated.ListMatchesByPodParams{
		PodID:  pgtype.Int8{Int64: podID, Valid: true},
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), nil
}

// ListByCourt returns paginated matches for a court.
func (s *MatchService) ListByCourt(ctx context.Context, courtID int64, limit, offset int32) ([]MatchResponse, error) {
	matches, err := s.queries.ListMatchesByCourt(ctx, generated.ListMatchesByCourtParams{
		CourtID: pgtype.Int8{Int64: courtID, Valid: true},
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), nil
}

// ListByTeam returns paginated matches for a team.
func (s *MatchService) ListByTeam(ctx context.Context, teamID int64, limit, offset int32) ([]MatchResponse, int64, error) {
	tid := pgtype.Int8{Int64: teamID, Valid: true}
	matches, err := s.queries.ListMatchesByTeam(ctx, generated.ListMatchesByTeamParams{
		Team1ID: tid,
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list matches: %w", err)
	}

	count, err := s.queries.CountMatchesByTeam(ctx, tid)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), count, nil
}

// ListByTournament returns paginated matches for a tournament.
func (s *MatchService) ListByTournament(ctx context.Context, tournamentID int64, limit, offset int32) ([]MatchResponse, error) {
	matches, err := s.queries.ListMatchesByTournament(ctx, generated.ListMatchesByTournamentParams{
		TournamentID: pgtype.Int8{Int64: tournamentID, Valid: true},
		Limit:        limit,
		Offset:       offset,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), nil
}

// ListQuickMatches returns paginated quick matches for a user.
func (s *MatchService) ListQuickMatches(ctx context.Context, userID int64, limit, offset int32) ([]MatchResponse, error) {
	matches, err := s.queries.ListQuickMatches(ctx, generated.ListQuickMatchesParams{
		CreatedByUserID: userID,
		Limit:           limit,
		Offset:          offset,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list quick matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), nil
}

// UpdateStatus transitions a match to a new status.
func (s *MatchService) UpdateStatus(ctx context.Context, id int64, newStatus string) (MatchResponse, error) {
	match, err := s.queries.GetMatch(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("get match for status update: %w", err)
	}

	allowed, ok := validMatchTransitions[match.Status]
	if !ok {
		return MatchResponse{}, &ValidationError{
			Message: fmt.Sprintf("no transitions allowed from status %q", match.Status),
		}
	}

	valid := false
	for _, s := range allowed {
		if s == newStatus {
			valid = true
			break
		}
	}
	if !valid {
		return MatchResponse{}, &ValidationError{
			Message: fmt.Sprintf("cannot transition from %q to %q", match.Status, newStatus),
		}
	}

	updated, err := s.queries.UpdateMatchStatus(ctx, generated.UpdateMatchStatusParams{
		ID:     id,
		Status: newStatus,
	})
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to update match status: %w", err)
	}

	resp := s.enrichedMatchResponse(ctx, updated)
	s.broadcastMatchUpdate(ctx, updated, resp)
	return resp, nil
}

// StartMatchInput carries optional body fields accepted by StartMatch.
// All fields are optional; nil means "do not change".
type StartMatchInput struct {
	ScoredByName         *string
	FirstServingTeam     *int32
	FirstServingPlayerID *int64
}

// StartMatch transitions a match to in_progress with started_at set, and records a start event.
// Uses a transaction to ensure atomicity.
// Returns a ScoringActionResult envelope matching other scoring mutations so
// the frontend can treat all scoring-action responses uniformly.
func (s *MatchService) StartMatch(ctx context.Context, matchID int64, userID int64, input StartMatchInput) (ScoringActionResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	match, err := qtx.GetMatchForUpdate(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoringActionResult{}, &NotFoundError{Message: "match not found"}
		}
		return ScoringActionResult{}, fmt.Errorf("get match for start: %w", err)
	}

	if match.Status != "scheduled" && match.Status != "warmup" {
		return ScoringActionResult{}, &ValidationError{
			Message: fmt.Sprintf("cannot start match in status %q", match.Status),
		}
	}

	// Apply optional first-serving-team override before the status transition so
	// the resulting row already reflects the intended serving team.
	if input.FirstServingTeam != nil {
		if *input.FirstServingTeam != 1 && *input.FirstServingTeam != 2 {
			return ScoringActionResult{}, &ValidationError{Message: "first_serving_team must be 1 or 2"}
		}
		if _, err := qtx.UpdateMatchScoring(ctx, generated.UpdateMatchScoringParams{
			ID:           matchID,
			Team1Score:   match.Team1Score,
			Team2Score:   match.Team2Score,
			CurrentSet:   match.CurrentSet,
			CurrentGame:  match.CurrentGame,
			ServingTeam:  pgtype.Int4{Int32: *input.FirstServingTeam, Valid: true},
			ServerNumber: match.ServerNumber,
			SetScores:    match.SetScores,
		}); err != nil {
			return ScoringActionResult{}, fmt.Errorf("failed to set first serving team: %w", err)
		}
	}

	updated, err := qtx.UpdateMatchStarted(ctx, matchID)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to start match: %w", err)
	}

	// Build the start event payload, including any optional metadata.
	nextSeq, err := qtx.GetNextSequenceID(ctx, matchID)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to get next sequence: %w", err)
	}

	startPayload := map[string]interface{}{"action": "match_started"}
	if input.ScoredByName != nil {
		startPayload["scored_by_name"] = *input.ScoredByName
	}
	if input.FirstServingTeam != nil {
		startPayload["first_serving_team"] = *input.FirstServingTeam
	}
	if input.FirstServingPlayerID != nil {
		startPayload["first_serving_player_id"] = *input.FirstServingPlayerID
	}
	payloadBytes, _ := json.Marshal(startPayload)

	event, err := qtx.CreateMatchEvent(ctx, generated.CreateMatchEventParams{
		MatchID:         matchID,
		SequenceID:      nextSeq,
		EventType:       EventTypeMatchStarted,
		Team1Score:      updated.Team1Score,
		Team2Score:      updated.Team2Score,
		CurrentSet:      updated.CurrentSet,
		CurrentGame:     updated.CurrentGame,
		ServingTeam:     updated.ServingTeam,
		ServerNumber:    updated.ServerNumber,
		SetScores:       updated.SetScores,
		Payload:         payloadBytes,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to record start event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to commit start match: %w", err)
	}

	resp := s.enrichedMatchResponse(ctx, updated)
	s.broadcastMatchUpdate(ctx, updated, resp)
	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(event),
	}, nil
}

// RecordEvent records a non-score-mutating timeline annotation (e.g. let, fault,
// line_call, timeout). Uses a transaction to ensure atomicity.
//
// Score-mutating event types (points, side-outs, undo, game/match confirmation)
// must NOT be recorded here: they have to flow through the scoring engine
// (ScorePoint, SideOut, RemovePoint, ConfirmGameOver, ...) so the engine stays
// the single source of truth. Previously this method re-implemented scoring
// inline with logic that diverged from the engine (e.g. flipping the serving
// team on every side-out instead of only on the second server's loss, and no
// game-over detection), corrupting live match state. Such types are now
// rejected, and unknown event types are rejected as well.
func (s *MatchService) RecordEvent(ctx context.Context, matchID int64, eventType string, payload json.RawMessage, userID int64) (MatchEventResponse, error) {
	if !IsValidEventType(eventType) {
		return MatchEventResponse{}, &ValidationError{
			Message: fmt.Sprintf("unknown event_type %q", eventType),
		}
	}
	if IsScoreMutatingEventType(eventType) {
		return MatchEventResponse{}, &ValidationError{
			Message: fmt.Sprintf("event_type %q changes the score and must be submitted through the scoring action endpoints (e.g. /point, /sideout, /remove-point, /undo, /confirm-game, /confirm-match), not the events endpoint", eventType),
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return MatchEventResponse{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	match, err := qtx.GetMatchForUpdate(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchEventResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchEventResponse{}, fmt.Errorf("get match for event recording: %w", err)
	}

	if match.Status != "in_progress" {
		return MatchEventResponse{}, &ValidationError{
			Message: fmt.Sprintf("cannot record events for match in status %q", match.Status),
		}
	}

	nextSeq, err := qtx.GetNextSequenceID(ctx, matchID)
	if err != nil {
		return MatchEventResponse{}, fmt.Errorf("failed to get next sequence: %w", err)
	}

	if payload == nil {
		payload = json.RawMessage("{}")
	}

	// Snapshot the current state with the annotation. Score/serving state is
	// left unchanged — this endpoint records annotations only.
	event, err := qtx.CreateMatchEvent(ctx, generated.CreateMatchEventParams{
		MatchID:         matchID,
		SequenceID:      nextSeq,
		EventType:       eventType,
		Team1Score:      match.Team1Score,
		Team2Score:      match.Team2Score,
		CurrentSet:      match.CurrentSet,
		CurrentGame:     match.CurrentGame,
		ServingTeam:     match.ServingTeam,
		ServerNumber:    match.ServerNumber,
		SetScores:       match.SetScores,
		Payload:         payload,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return MatchEventResponse{}, fmt.Errorf("failed to create event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return MatchEventResponse{}, fmt.Errorf("failed to commit event: %w", err)
	}

	return toMatchEventResponse(event), nil
}

// Undo reverts the last event by restoring the snapshot from the previous event.
// Uses a transaction to ensure atomicity.
func (s *MatchService) Undo(ctx context.Context, matchID int64, userID int64) (ScoringActionResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	match, err := qtx.GetMatchForUpdate(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoringActionResult{}, &NotFoundError{Message: "match not found"}
		}
		return ScoringActionResult{}, fmt.Errorf("get match for undo: %w", err)
	}

	if match.Status != "in_progress" {
		return ScoringActionResult{}, &ValidationError{
			Message: fmt.Sprintf("cannot undo events for match in status %q", match.Status),
		}
	}

	// Get the latest event
	latestEvent, err := qtx.GetLatestMatchEvent(ctx, matchID)
	if err != nil {
		return ScoringActionResult{}, &ValidationError{Message: "no events to undo"}
	}

	// Record undo event with the current state as snapshot
	nextSeq, err := qtx.GetNextSequenceID(ctx, matchID)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to get next sequence: %w", err)
	}

	undoPayload, _ := json.Marshal(map[string]interface{}{
		"undone_event_sequence": latestEvent.SequenceID,
		"undone_event_type":     latestEvent.EventType,
	})

	undoEvent, err := qtx.CreateMatchEvent(ctx, generated.CreateMatchEventParams{
		MatchID:         matchID,
		SequenceID:      nextSeq,
		EventType:       EventTypeUndo,
		Team1Score:      match.Team1Score,
		Team2Score:      match.Team2Score,
		CurrentSet:      match.CurrentSet,
		CurrentGame:     match.CurrentGame,
		ServingTeam:     match.ServingTeam,
		ServerNumber:    match.ServerNumber,
		SetScores:       match.SetScores,
		Payload:         undoPayload,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to record undo event: %w", err)
	}

	// Restore score from the snapshot stored in the latest event (which captured the state BEFORE that event)
	updated, err := qtx.UpdateMatchScoring(ctx, generated.UpdateMatchScoringParams{
		ID:           matchID,
		Team1Score:   latestEvent.Team1Score,
		Team2Score:   latestEvent.Team2Score,
		CurrentSet:   latestEvent.CurrentSet,
		CurrentGame:  latestEvent.CurrentGame,
		ServingTeam:  latestEvent.ServingTeam,
		ServerNumber: latestEvent.ServerNumber,
		SetScores:    latestEvent.SetScores,
	})
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to restore score: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to commit undo: %w", err)
	}

	resp := s.enrichedMatchResponse(ctx, updated)
	s.broadcastMatchUpdate(ctx, updated, resp)
	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(undoEvent),
	}, nil
}

// GetMatchEvents returns all events for a match.
func (s *MatchService) GetMatchEvents(ctx context.Context, matchID int64) ([]MatchEventResponse, error) {
	// Verify match exists
	_, err := s.queries.GetMatch(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Message: "match not found"}
		}
		return nil, fmt.Errorf("get match for events: %w", err)
	}

	events, err := s.queries.ListMatchEvents(ctx, matchID)
	if err != nil {
		return nil, fmt.Errorf("failed to list match events: %w", err)
	}

	result := make([]MatchEventResponse, len(events))
	for i, e := range events {
		result[i] = toMatchEventResponse(e)
	}
	return result, nil
}

// AssignToCourt assigns a match to a court.
func (s *MatchService) AssignToCourt(ctx context.Context, matchID int64, courtID int64) (MatchResponse, error) {
	match, err := s.queries.GetMatch(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("get match for court assignment: %w", err)
	}

	if match.Status == "completed" || match.Status == "cancelled" || match.Status == "forfeited" {
		return MatchResponse{}, &ValidationError{
			Message: fmt.Sprintf("cannot assign court to match in status %q", match.Status),
		}
	}

	updated, err := s.queries.UpdateMatchCourt(ctx, generated.UpdateMatchCourtParams{
		ID:      matchID,
		CourtID: pgtype.Int8{Int64: courtID, Valid: true},
	})
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to assign court: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// UpdateScoringConfig updates the scoring configuration of a match.
func (s *MatchService) UpdateScoringConfig(ctx context.Context, matchID int64, params generated.UpdateMatchScoringConfigParams) (MatchResponse, error) {
	match, err := s.queries.GetMatch(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("get match for scoring config update: %w", err)
	}

	if match.Status != "scheduled" && match.Status != "warmup" {
		return MatchResponse{}, &ValidationError{
			Message: "scoring config can only be changed before a match starts",
		}
	}

	params.ID = matchID
	updated, err := s.queries.UpdateMatchScoringConfig(ctx, params)
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to update scoring config: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// UpdateNotes updates the notes of a match.
func (s *MatchService) UpdateNotes(ctx context.Context, matchID int64, notes *string) (MatchResponse, error) {
	updated, err := s.queries.UpdateMatchNotes(ctx, generated.UpdateMatchNotesParams{
		ID:    matchID,
		Notes: notes,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("update match notes: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// UpdateReferee assigns a referee to a match.
func (s *MatchService) UpdateReferee(ctx context.Context, matchID int64, refereeUserID *int64) (MatchResponse, error) {
	var refID pgtype.Int8
	if refereeUserID != nil {
		refID = pgtype.Int8{Int64: *refereeUserID, Valid: true}
	}

	updated, err := s.queries.UpdateMatchReferee(ctx, generated.UpdateMatchRefereeParams{
		ID:            matchID,
		RefereeUserID: refID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("update match referee: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// GetActiveMatchOnCourt returns the currently active match on a court, if any.
func (s *MatchService) GetActiveMatchOnCourt(ctx context.Context, courtID int64) (*MatchResponse, error) {
	match, err := s.queries.GetActiveMatchOnCourt(ctx, pgtype.Int8{Int64: courtID, Valid: true})
	if err != nil {
		// No active match is not an error
		return nil, nil
	}

	resp := s.enrichedMatchResponse(ctx, match)
	return &resp, nil
}

// ListLive returns all currently live matches (warmup, in_progress, paused)
// with enriched team/tournament/court names for public spectator views.
func (s *MatchService) ListLive(ctx context.Context, limit, offset int32) ([]MatchResponse, int64, error) {
	matches, err := s.queries.ListLiveMatches(ctx, generated.ListLiveMatchesParams{
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list live matches: %w", err)
	}

	count, err := s.queries.CountLiveMatches(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count live matches: %w", err)
	}

	return s.enrichMatchesBatch(ctx, matches), count, nil
}

// CompleteMatch marks a match as completed with a result.
func (s *MatchService) CompleteMatch(ctx context.Context, matchID int64, winnerTeamID, loserTeamID int64, winReason string) (MatchResponse, error) {
	match, err := s.queries.GetMatch(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("get match for completion: %w", err)
	}

	if match.Status != "in_progress" && match.Status != "paused" {
		return MatchResponse{}, &ValidationError{
			Message: fmt.Sprintf("cannot complete match in status %q", match.Status),
		}
	}

	updated, err := s.queries.UpdateMatchResult(ctx, generated.UpdateMatchResultParams{
		ID:           matchID,
		WinnerTeamID: pgtype.Int8{Int64: winnerTeamID, Valid: true},
		LoserTeamID:  pgtype.Int8{Int64: loserTeamID, Valid: true},
		WinReason:    &winReason,
	})
	if err != nil {
		return MatchResponse{}, fmt.Errorf("failed to complete match: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// CleanupExpiredQuickMatches removes expired quick matches.
func (s *MatchService) CleanupExpiredQuickMatches(ctx context.Context) error {
	return s.queries.DeleteExpiredQuickMatches(ctx)
}

// UpdateTeams updates the teams on a match.
func (s *MatchService) UpdateTeams(ctx context.Context, matchID int64, params generated.UpdateMatchTeamsParams) (MatchResponse, error) {
	params.ID = matchID

	updated, err := s.queries.UpdateMatchTeams(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("update match teams: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// UpdateBracketWiring updates the bracket wiring of a match.
func (s *MatchService) UpdateBracketWiring(ctx context.Context, matchID int64, params generated.UpdateMatchBracketWiringParams) (MatchResponse, error) {
	params.ID = matchID

	updated, err := s.queries.UpdateMatchBracketWiring(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return MatchResponse{}, fmt.Errorf("update match bracket wiring: %w", err)
	}

	return s.enrichedMatchResponse(ctx, updated), nil
}

// ---------------------------------------------------------------------------
// Scoring Engine Integration
// ---------------------------------------------------------------------------

// ScoringActionResult wraps the result of a scoring action.
type ScoringActionResult struct {
	Match             MatchResponse      `json:"match"`
	Event             MatchEventResponse `json:"event"`
	GameOverDetected  bool               `json:"game_over_detected"`
	MatchOverDetected bool               `json:"match_over_detected"`
	EndChangeDetected bool               `json:"end_change_detected"`
	ScoreCall         string             `json:"score_call"`
}

// matchToEngineState converts a generated.Match to an engine.MatchState.
func matchToEngineState(m generated.Match) engine.MatchState {
	state := engine.MatchState{
		TeamOneScore:   m.Team1Score,
		TeamTwoScore:   m.Team2Score,
		CurrentGameNum: m.CurrentGame,
		Status:         engine.MatchStatus(m.Status),
		IsPaused:       m.Status == "paused",
	}

	if m.ServingTeam.Valid {
		state.ServingTeam = m.ServingTeam.Int32
	} else {
		state.ServingTeam = 1
	}
	if m.ServerNumber.Valid {
		state.ServerNumber = m.ServerNumber.Int32
	} else {
		state.ServerNumber = 1
	}

	// Decode completed games from set_scores JSON.
	if len(m.SetScores) > 0 {
		var games []engine.GameResult
		if err := json.Unmarshal(m.SetScores, &games); err == nil {
			state.CompletedGames = games
		}
	}

	return state
}

// matchToScoringConfig builds an engine.ScoringConfig from a match's settings.
func matchToScoringConfig(m generated.Match) engine.ScoringConfig {
	scoringType := engine.SideOutScoring
	if m.RallyScoring {
		scoringType = engine.RallyScoring
	}

	var maxPts int32
	if m.MaxPoints.Valid {
		maxPts = m.MaxPoints.Int32
	}
	var freezeAt int32
	if m.FreezeAt.Valid {
		freezeAt = m.FreezeAt.Int32
	}

	cfg, _ := engine.ParseScoringConfig(scoringType, m.PointsToWin, m.WinBy, maxPts, m.GamesPerSet, m.SetsToWin, freezeAt)
	return cfg
}

// applyEngineResult computes and persists a scoring action in a single
// transaction.
//
// The engine computation is supplied as `compute` and is run AGAINST THE
// ROW-LOCKED match (GetMatchForUpdate) inside the transaction, not against an
// earlier unlocked read. This closes the lost-update race: the value written
// always derives from the row read under FOR UPDATE, so two concurrent or
// rapid-repeat scoring requests can no longer both compute N+1 from the same
// stale N and clobber each other.
//
// The event row stores the PRE-action snapshot (the locked match's state before
// `compute` is applied), matching RecordEvent's convention. This is what Undo
// relies on when it restores from the latest event.
//
// Returns the raw generated.Match, the engine instance (config-bound, useful for
// ScoreCall), the EngineResult, the MatchEvent, and the enriched MatchResponse.
// Enrichment runs exactly once (per CR-4). Callers MUST use the returned
// MatchResponse instead of calling enrichedMatchResponse again.
func (s *MatchService) applyEngineResult(
	ctx context.Context,
	matchID int64,
	compute func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult,
	eventType string,
	payload json.RawMessage,
	userID int64,
) (generated.Match, *engine.ScoringEngine, engine.EngineResult, generated.MatchEvent, MatchResponse, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	match, err := qtx.GetMatchForUpdate(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, &NotFoundError{Message: "match not found"}
		}
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("get match for engine result: %w", err)
	}

	// Run the engine against the row-locked match so the persisted value derives
	// from the locked read (lost-update protection).
	eng := engine.NewScoringEngine(matchToScoringConfig(match))
	result := compute(eng, matchToEngineState(match))
	if result.IsError {
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, &ValidationError{Message: result.ErrorMessage}
	}

	// Encode completed games as set_scores JSON.
	setScores := match.SetScores
	if len(result.State.CompletedGames) > 0 {
		encoded, err := json.Marshal(result.State.CompletedGames)
		if err == nil {
			setScores = encoded
		}
	}

	// Determine new status.
	newStatus := match.Status
	if result.State.Status == engine.StatusPaused {
		newStatus = "paused"
	} else if result.State.Status == engine.StatusCompleted {
		newStatus = "completed"
	} else if result.State.Status == engine.StatusForfeited {
		newStatus = "forfeited"
	} else if result.State.Status == engine.StatusInProgress {
		newStatus = "in_progress"
	}

	// Update match scoring state.
	updated, err := qtx.UpdateMatchScoring(ctx, generated.UpdateMatchScoringParams{
		ID:           matchID,
		Team1Score:   result.State.TeamOneScore,
		Team2Score:   result.State.TeamTwoScore,
		CurrentSet:   match.CurrentSet,
		CurrentGame:  result.State.CurrentGameNum,
		ServingTeam:  pgtype.Int4{Int32: result.State.ServingTeam, Valid: true},
		ServerNumber: pgtype.Int4{Int32: result.State.ServerNumber, Valid: true},
		SetScores:    setScores,
	})
	if err != nil {
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("failed to update match scoring: %w", err)
	}

	// If status changed, update it.
	if newStatus != match.Status {
		updated, err = qtx.UpdateMatchStatus(ctx, generated.UpdateMatchStatusParams{
			ID:     matchID,
			Status: newStatus,
		})
		if err != nil {
			return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("failed to update match status: %w", err)
		}
	}

	// Record event.
	nextSeq, err := qtx.GetNextSequenceID(ctx, matchID)
	if err != nil {
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("failed to get next sequence: %w", err)
	}

	if payload == nil {
		payload = json.RawMessage("{}")
	}

	// Snapshot the state BEFORE this action (the row read under lock), so the
	// snapshot semantics match RecordEvent and Undo can correctly restore the
	// prior state from the latest event.
	event, err := qtx.CreateMatchEvent(ctx, generated.CreateMatchEventParams{
		MatchID:         matchID,
		SequenceID:      nextSeq,
		EventType:       eventType,
		Team1Score:      match.Team1Score,
		Team2Score:      match.Team2Score,
		CurrentSet:      match.CurrentSet,
		CurrentGame:     match.CurrentGame,
		ServingTeam:     match.ServingTeam,
		ServerNumber:    match.ServerNumber,
		SetScores:       match.SetScores,
		Payload:         payload,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("failed to create event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return generated.Match{}, nil, engine.EngineResult{}, generated.MatchEvent{}, MatchResponse{}, fmt.Errorf("failed to commit: %w", err)
	}

	// Enrich ONCE (CR-4). broadcast + HTTP response share this value.
	resp := s.enrichedMatchResponse(ctx, updated)
	s.broadcastMatchUpdate(ctx, updated, resp)
	return updated, eng, result, event, resp, nil
}

// ScorePoint awards a point to the given team via the scoring engine.
func (s *MatchService) ScorePoint(ctx context.Context, matchID int64, team int32, userID int64) (ScoringActionResult, error) {
	payload, _ := json.Marshal(map[string]interface{}{"team": team})
	eventType := fmt.Sprintf("point_team%d", team)

	_, eng, result, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.Point(state, team)
		}, eventType, payload, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match:             resp,
		Event:             toMatchEventResponse(event),
		GameOverDetected:  result.GameOverDetected,
		MatchOverDetected: result.MatchOverDetected,
		EndChangeDetected: result.EndChangeDetected,
		ScoreCall:         eng.ScoreCall(result.State),
	}, nil
}

// SideOut handles a side-out (loss of serve).
func (s *MatchService) SideOut(ctx context.Context, matchID int64, userID int64) (ScoringActionResult, error) {
	_, eng, result, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.SideOut(state)
		}, EventTypeSideOut, nil, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match:     resp,
		Event:     toMatchEventResponse(event),
		ScoreCall: eng.ScoreCall(result.State),
	}, nil
}

// RemovePoint removes the last point scored for a team.
func (s *MatchService) RemovePoint(ctx context.Context, matchID int64, team int32, userID int64) (ScoringActionResult, error) {
	payload, _ := json.Marshal(map[string]interface{}{"team": team})
	_, eng, result, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			// Use current serving state as previous (simplified undo — full undo via Undo endpoint).
			return eng.RemovePoint(state, team, state.ServingTeam, state.ServerNumber)
		}, EventTypePointRemoved, payload, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match:     resp,
		Event:     toMatchEventResponse(event),
		ScoreCall: eng.ScoreCall(result.State),
	}, nil
}

// ConfirmGameOver transitions to the next game after a game win is detected.
func (s *MatchService) ConfirmGameOver(ctx context.Context, matchID int64, userID int64) (ScoringActionResult, error) {
	_, eng, result, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.ConfirmGameOver(state)
		}, EventTypeConfirmGameOver, nil, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match:     resp,
		Event:     toMatchEventResponse(event),
		ScoreCall: eng.ScoreCall(result.State),
	}, nil
}

// ConfirmMatchOver finalizes the match as completed.
func (s *MatchService) ConfirmMatchOver(ctx context.Context, matchID int64, winnerTeamID, loserTeamID int64, userID int64) (ScoringActionResult, error) {
	updated, _, _, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.ConfirmMatchOver(state)
		}, EventTypeConfirmMatchOver, nil, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	// Derive winner/loser from the set_scores snapshot if the caller did not
	// supply them. The frontend sends an empty body and expects the backend to
	// work out who won by counting game victories. Without this, the final
	// match row never records winner_team_id, standings never update, and
	// bracket progression breaks silently.
	team1Wins, team2Wins := 0, 0
	if winnerTeamID == 0 && loserTeamID == 0 {
		if len(updated.SetScores) > 0 {
			var games []engine.GameResult
			if err := json.Unmarshal(updated.SetScores, &games); err == nil {
				for _, g := range games {
					switch g.Winner {
					case 1:
						team1Wins++
					case 2:
						team2Wins++
					}
				}
			}
		}
		if team1Wins > team2Wins && updated.Team1ID.Valid && updated.Team2ID.Valid {
			winnerTeamID = updated.Team1ID.Int64
			loserTeamID = updated.Team2ID.Int64
		} else if team2Wins > team1Wins && updated.Team1ID.Valid && updated.Team2ID.Valid {
			winnerTeamID = updated.Team2ID.Int64
			loserTeamID = updated.Team1ID.Int64
		}
	}

	// CR-8: when inference couldn't pick a winner (tied games) AND caller
	// didn't supply explicit winner, reject instead of silently committing
	// a completed row with NULL winner_team_id.
	if winnerTeamID == 0 && loserTeamID == 0 && team1Wins == team2Wins {
		return ScoringActionResult{}, &ValidationError{
			Message: "cannot confirm match with tied games; provide explicit winner_team_id",
		}
	}

	// Set winner/loser via the existing CompleteMatch logic.
	if winnerTeamID > 0 && loserTeamID > 0 {
		final, err := s.queries.UpdateMatchResult(ctx, generated.UpdateMatchResultParams{
			ID:           matchID,
			WinnerTeamID: pgtype.Int8{Int64: winnerTeamID, Valid: true},
			LoserTeamID:  pgtype.Int8{Int64: loserTeamID, Valid: true},
			WinReason:    strPtr("score"),
		})
		if err != nil {
			return ScoringActionResult{}, fmt.Errorf("setting match result: %w", err)
		}
		// Re-enrich with the final winner/loser baked in.
		finalResp := s.enrichedMatchResponse(ctx, final)
		return ScoringActionResult{
			Match: finalResp,
			Event: toMatchEventResponse(event),
		}, nil
	}

	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(event),
	}, nil
}

// CallTimeout records a timeout event.
func (s *MatchService) CallTimeout(ctx context.Context, matchID int64, team int32, userID int64) (ScoringActionResult, error) {
	payload, _ := json.Marshal(map[string]interface{}{"team": team})
	_, eng, result, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.Timeout(state, team)
		}, EventTypeTimeout, payload, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match:     resp,
		Event:     toMatchEventResponse(event),
		ScoreCall: eng.ScoreCall(result.State),
	}, nil
}

// PauseMatch pauses the match.
func (s *MatchService) PauseMatch(ctx context.Context, matchID int64, userID int64) (ScoringActionResult, error) {
	_, _, _, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.Pause(state)
		}, EventTypeMatchPaused, nil, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(event),
	}, nil
}

// ResumeMatch resumes a paused match.
func (s *MatchService) ResumeMatch(ctx context.Context, matchID int64, userID int64) (ScoringActionResult, error) {
	_, _, _, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.Resume(state)
		}, EventTypeMatchResumed, nil, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(event),
	}, nil
}

// DeclareForfeit forfeits the match for a team. The reason argument is
// optional free text that's recorded in the forfeit_declared event payload
// for audit purposes; an empty string is allowed.
func (s *MatchService) DeclareForfeit(ctx context.Context, matchID int64, forfeitingTeam int32, winnerTeamID, loserTeamID int64, reason string, userID int64) (ScoringActionResult, error) {
	payloadMap := map[string]interface{}{"forfeiting_team": forfeitingTeam}
	if reason != "" {
		payloadMap["reason"] = reason
	}
	payload, _ := json.Marshal(payloadMap)
	_, _, _, event, resp, err := s.applyEngineResult(ctx, matchID,
		func(eng *engine.ScoringEngine, state engine.MatchState) engine.EngineResult {
			return eng.Forfeit(state, forfeitingTeam)
		}, EventTypeForfeitDeclared, payload, userID)
	if err != nil {
		return ScoringActionResult{}, err
	}

	// Set winner/loser.
	if winnerTeamID > 0 && loserTeamID > 0 {
		final, err := s.queries.UpdateMatchResult(ctx, generated.UpdateMatchResultParams{
			ID:           matchID,
			WinnerTeamID: pgtype.Int8{Int64: winnerTeamID, Valid: true},
			LoserTeamID:  pgtype.Int8{Int64: loserTeamID, Valid: true},
			WinReason:    strPtr("forfeit"),
		})
		if err != nil {
			return ScoringActionResult{}, fmt.Errorf("setting forfeit result: %w", err)
		}
		return ScoringActionResult{
			Match: s.enrichedMatchResponse(ctx, final),
			Event: toMatchEventResponse(event),
		}, nil
	}

	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(event),
	}, nil
}

func strPtr(s string) *string {
	return &s
}

// ---------------------------------------------------------------------------
// Score Override (admin-only audited action)
// ---------------------------------------------------------------------------

// OverrideGameInput represents a single game's overridden score.
// A nil Winner means this game is the live (in-progress) game; a non-nil
// Winner (1 or 2) means the game is treated as completed.
type OverrideGameInput struct {
	GameNumber int32
	Team1Score int32
	Team2Score int32
	Winner     *int32
}

// OverrideScore directly updates a match's scoring state, bypassing the
// scoring engine. Intended for platform_admin corrections only. Records a
// SCORE_OVERRIDE event capturing the before/after state and reason.
func (s *MatchService) OverrideScore(
	ctx context.Context,
	matchID int64,
	games []OverrideGameInput,
	userID int64,
	reason string,
) (ScoringActionResult, error) {
	if len(games) == 0 {
		return ScoringActionResult{}, &ValidationError{Message: "at least one game is required"}
	}
	if len(reason) < 10 {
		return ScoringActionResult{}, &ValidationError{Message: "reason must be at least 10 characters"}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := s.queries.WithTx(tx)

	match, err := qtx.GetMatchForUpdate(ctx, matchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoringActionResult{}, &NotFoundError{Message: "match not found"}
		}
		return ScoringActionResult{}, fmt.Errorf("get match for score override: %w", err)
	}

	// Capture previous state for the audit event.
	prevSetScores := match.SetScores
	if len(prevSetScores) == 0 {
		prevSetScores = []byte("[]")
	}

	// Split incoming games into completed (winner != nil) and the live game (winner == nil).
	var completed []engine.GameResult
	var liveGame *OverrideGameInput
	for i, g := range games {
		if g.Winner != nil {
			completed = append(completed, engine.GameResult{
				GameNum:      g.GameNumber,
				TeamOneScore: g.Team1Score,
				TeamTwoScore: g.Team2Score,
				Winner:       *g.Winner,
			})
		} else {
			if liveGame != nil {
				return ScoringActionResult{}, &ValidationError{
					Message: "only one game may have a null winner (the live game)",
				}
			}
			liveGame = &games[i]
		}
	}

	// Determine new live-game score and game number.
	var newTeam1Score, newTeam2Score, newCurrentGame int32
	if liveGame != nil {
		newTeam1Score = liveGame.Team1Score
		newTeam2Score = liveGame.Team2Score
		newCurrentGame = liveGame.GameNumber
	} else {
		// All games are completed: zero the live score, set current_game past the
		// highest completed game number.
		newTeam1Score = 0
		newTeam2Score = 0
		var maxGame int32
		for _, g := range completed {
			if g.GameNum > maxGame {
				maxGame = g.GameNum
			}
		}
		newCurrentGame = maxGame
	}

	setScoresJSON := []byte("[]")
	if len(completed) > 0 {
		encoded, err := json.Marshal(completed)
		if err != nil {
			return ScoringActionResult{}, fmt.Errorf("failed to encode set_scores: %w", err)
		}
		setScoresJSON = encoded
	}

	updated, err := qtx.UpdateMatchScoring(ctx, generated.UpdateMatchScoringParams{
		ID:           matchID,
		Team1Score:   newTeam1Score,
		Team2Score:   newTeam2Score,
		CurrentSet:   match.CurrentSet,
		CurrentGame:  newCurrentGame,
		ServingTeam:  match.ServingTeam,
		ServerNumber: match.ServerNumber,
		SetScores:    setScoresJSON,
	})
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to update match scoring: %w", err)
	}

	// Build the audit payload.
	gamesPayload := make([]map[string]interface{}, len(games))
	for i, g := range games {
		entry := map[string]interface{}{
			"game_number":  g.GameNumber,
			"team_1_score": g.Team1Score,
			"team_2_score": g.Team2Score,
		}
		if g.Winner != nil {
			entry["winner"] = *g.Winner
		} else {
			entry["winner"] = nil
		}
		gamesPayload[i] = entry
	}

	payload, err := json.Marshal(map[string]interface{}{
		"reason":                reason,
		"actor_user_id":         userID,
		"previous_team_1_score": match.Team1Score,
		"previous_team_2_score": match.Team2Score,
		"previous_current_game": match.CurrentGame,
		"previous_set_scores":   json.RawMessage(prevSetScores),
		"new_team_1_score":      newTeam1Score,
		"new_team_2_score":      newTeam2Score,
		"new_current_game":      newCurrentGame,
		"new_set_scores":        json.RawMessage(setScoresJSON),
		"games":                 gamesPayload,
	})
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to encode override payload: %w", err)
	}

	nextSeq, err := qtx.GetNextSequenceID(ctx, matchID)
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to get next sequence: %w", err)
	}

	overrideEvent, err := qtx.CreateMatchEvent(ctx, generated.CreateMatchEventParams{
		MatchID:         matchID,
		SequenceID:      nextSeq,
		EventType:       EventTypeScoreOverride,
		Team1Score:      newTeam1Score,
		Team2Score:      newTeam2Score,
		CurrentSet:      match.CurrentSet,
		CurrentGame:     newCurrentGame,
		ServingTeam:     match.ServingTeam,
		ServerNumber:    match.ServerNumber,
		SetScores:       setScoresJSON,
		Payload:         payload,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to record override event: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ScoringActionResult{}, fmt.Errorf("failed to commit override: %w", err)
	}

	resp := s.enrichedMatchResponse(ctx, updated)
	s.broadcastMatchUpdate(ctx, updated, resp)
	return ScoringActionResult{
		Match: resp,
		Event: toMatchEventResponse(overrideEvent),
	}, nil
}
