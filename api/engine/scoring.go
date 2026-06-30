package engine

import "fmt"

// MatchStatus represents the current state of a match.
type MatchStatus string

const (
	StatusScheduled  MatchStatus = "scheduled"
	StatusWarmup     MatchStatus = "warmup"
	StatusInProgress MatchStatus = "in_progress"
	StatusPaused     MatchStatus = "paused"
	StatusCompleted  MatchStatus = "completed"
	StatusCancelled  MatchStatus = "cancelled"
	StatusForfeited  MatchStatus = "forfeited"
)

// ServingTeam identifies which team is serving (1 or 2).
type ServingTeam int32

const (
	TeamOne ServingTeam = 1
	TeamTwo ServingTeam = 2
)

// GameResult captures the outcome of a completed game.
type GameResult struct {
	GameNum      int32 `json:"game_num"`
	TeamOneScore int32 `json:"team_one_score"`
	TeamTwoScore int32 `json:"team_two_score"`
	Winner       int32 `json:"winner"` // 1 or 2
}

// MatchState holds the live scoring state of a match.
type MatchState struct {
	TeamOneScore   int32        `json:"team_one_score"`
	TeamTwoScore   int32        `json:"team_two_score"`
	ServingTeam    int32        `json:"serving_team"`  // 1 or 2
	ServerNumber   int32        `json:"server_number"` // 1 or 2 (for doubles side-out)
	CurrentGameNum int32        `json:"current_game_num"`
	CompletedGames []GameResult `json:"completed_games"`
	Status         MatchStatus  `json:"status"`
	IsPaused       bool         `json:"is_paused"`
}

// EngineResult is returned from every scoring action.
type EngineResult struct {
	State             MatchState `json:"state"`
	GameOverDetected  bool       `json:"game_over_detected"`
	MatchOverDetected bool       `json:"match_over_detected"`
	EndChangeDetected bool       `json:"end_change_detected"`
	IsError           bool       `json:"is_error"`
	ErrorMessage      string     `json:"error_message,omitempty"`
}

// ScoringEngine processes scoring actions against a match state.
type ScoringEngine struct {
	config ScoringConfig
}

// NewScoringEngine creates a new engine with the given config.
func NewScoringEngine(config ScoringConfig) *ScoringEngine {
	return &ScoringEngine{config: config}
}

func errResult(state MatchState, msg string) EngineResult {
	return EngineResult{
		State:        state,
		IsError:      true,
		ErrorMessage: msg,
	}
}

// Point awards a point to the specified team.
func (e *ScoringEngine) Point(state MatchState, scoringTeam int32) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot score point: match status is %q", state.Status))
	}

	// Side-out scoring: only the serving team can score.
	if e.config.ScoringType == SideOutScoring && scoringTeam != state.ServingTeam {
		return errResult(state, "in side-out scoring, only the serving team can score")
	}

	if scoringTeam == 1 {
		state.TeamOneScore++
	} else {
		state.TeamTwoScore++
	}

	// In rally scoring, service follows the scoring team.
	if e.config.ScoringType == RallyScoring {
		state.ServingTeam = scoringTeam
		state.ServerNumber = 1
	}

	result := EngineResult{State: state}

	// Check end change.
	totalGamesPlayed := int32(len(state.CompletedGames))
	if e.config.IsEndChange(state.TeamOneScore, state.TeamTwoScore, state.CurrentGameNum, totalGamesPlayed) {
		result.EndChangeDetected = true
	}

	// Check game over.
	var winner, loser int32
	if e.config.IsGameOver(state.TeamOneScore, state.TeamTwoScore) {
		winner, loser = 1, 2
	} else if e.config.IsGameOver(state.TeamTwoScore, state.TeamOneScore) {
		winner, loser = 2, 1
	}
	_ = loser

	if winner > 0 {
		result.GameOverDetected = true

		// Record completed game.
		state.CompletedGames = append(state.CompletedGames, GameResult{
			GameNum:      state.CurrentGameNum,
			TeamOneScore: state.TeamOneScore,
			TeamTwoScore: state.TeamTwoScore,
			Winner:       winner,
		})

		// Check match over. The match is decided by SET wins, not raw game
		// wins: CompletedGames accumulates every game of the entire match, so we
		// segment it into sets (each won by the first team to GamesToWin() games)
		// and only finish when a team reaches SetsToWin sets. With SetsToWin==1
		// this reduces to "first team to GamesToWin() games wins the match".
		team1Sets, team2Sets := e.countSetWins(state.CompletedGames)
		setsToWin := e.config.SetsToWin
		if setsToWin < 1 {
			setsToWin = 1
		}

		if team1Sets >= setsToWin || team2Sets >= setsToWin {
			result.MatchOverDetected = true
		}

		result.State = state
	}

	return result
}

// SideOut handles a side-out (loss of serve) in side-out scoring.
// Server 1 -> Server 2 on same team; Server 2 -> switch serving team, reset to server 1.
func (e *ScoringEngine) SideOut(state MatchState) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot side out: match status is %q", state.Status))
	}

	if state.ServerNumber == 1 {
		state.ServerNumber = 2
	} else {
		// Switch serving team.
		if state.ServingTeam == 1 {
			state.ServingTeam = 2
		} else {
			state.ServingTeam = 1
		}
		state.ServerNumber = 1
	}

	return EngineResult{State: state}
}

// RemovePoint removes the last point scored (undo).
// The caller must provide which team to remove the point from and the previous
// serving state. This is a simplified undo that just decrements.
func (e *ScoringEngine) RemovePoint(state MatchState, team int32, prevServingTeam, prevServerNumber int32) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot remove point: match status is %q", state.Status))
	}

	if team == 1 {
		if state.TeamOneScore <= 0 {
			return errResult(state, "team 1 score is already 0")
		}
		state.TeamOneScore--
	} else if team == 2 {
		if state.TeamTwoScore <= 0 {
			return errResult(state, "team 2 score is already 0")
		}
		state.TeamTwoScore--
	} else {
		return errResult(state, fmt.Sprintf("invalid team: %d", team))
	}

	state.ServingTeam = prevServingTeam
	state.ServerNumber = prevServerNumber

	return EngineResult{State: state}
}

// ConfirmGameOver transitions the match to the next game after a game win.
// Resets scores and advances the game number.
func (e *ScoringEngine) ConfirmGameOver(state MatchState) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot confirm game over: match status is %q", state.Status))
	}

	if len(state.CompletedGames) == 0 {
		return errResult(state, "no completed game to confirm")
	}

	lastGame := state.CompletedGames[len(state.CompletedGames)-1]
	if lastGame.GameNum != state.CurrentGameNum {
		return errResult(state, "current game does not match last completed game")
	}

	// Reset scores for next game.
	state.TeamOneScore = 0
	state.TeamTwoScore = 0
	state.CurrentGameNum++

	// In many formats, the losing team of the previous game serves first in the next.
	if lastGame.Winner == 1 {
		state.ServingTeam = 2
	} else {
		state.ServingTeam = 1
	}
	state.ServerNumber = 1

	return EngineResult{State: state}
}

// ConfirmMatchOver finalizes the match as completed.
func (e *ScoringEngine) ConfirmMatchOver(state MatchState) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot confirm match over: match status is %q", state.Status))
	}

	state.Status = StatusCompleted
	return EngineResult{State: state}
}

// Timeout records a timeout (no state change in the engine, just validation).
func (e *ScoringEngine) Timeout(state MatchState, team int32) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot call timeout: match status is %q", state.Status))
	}
	if team != 1 && team != 2 {
		return errResult(state, fmt.Sprintf("invalid team for timeout: %d", team))
	}
	return EngineResult{State: state}
}

// Pause pauses the match.
func (e *ScoringEngine) Pause(state MatchState) EngineResult {
	if state.Status != StatusInProgress {
		return errResult(state, fmt.Sprintf("cannot pause: match status is %q", state.Status))
	}
	state.IsPaused = true
	state.Status = StatusPaused
	return EngineResult{State: state}
}

// Resume resumes a paused match.
func (e *ScoringEngine) Resume(state MatchState) EngineResult {
	if state.Status != StatusPaused {
		return errResult(state, fmt.Sprintf("cannot resume: match status is %q", state.Status))
	}
	state.IsPaused = false
	state.Status = StatusInProgress
	return EngineResult{State: state}
}

// Forfeit forfeits the match for a team.
func (e *ScoringEngine) Forfeit(state MatchState, forfeitingTeam int32) EngineResult {
	if state.Status != StatusInProgress && state.Status != StatusPaused {
		return errResult(state, fmt.Sprintf("cannot forfeit: match status is %q", state.Status))
	}
	if forfeitingTeam != 1 && forfeitingTeam != 2 {
		return errResult(state, fmt.Sprintf("invalid forfeiting team: %d", forfeitingTeam))
	}
	state.Status = StatusForfeited
	return EngineResult{State: state}
}

// ScoreCall returns the current score as a formatted string.
// Format: "TeamOne: X - TeamTwo: Y | Serving: Team N, Server N | Game N"
func (e *ScoringEngine) ScoreCall(state MatchState) string {
	return fmt.Sprintf("%d-%d-%d",
		state.TeamOneScore,
		state.TeamTwoScore,
		state.ServerNumber,
	)
}

// countWins tallies game wins per team.
func countWins(games []GameResult) (int32, int32) {
	var t1, t2 int32
	for _, g := range games {
		if g.Winner == 1 {
			t1++
		} else if g.Winner == 2 {
			t2++
		}
	}
	return t1, t2
}

// countSetWins segments the match's completed games into sets and tallies set
// wins per team. games is the full, ordered list of completed games for the
// whole match (CompletedGames is never reset per set). Within each set the
// first team to GamesToWin() game wins takes the set; the in-set tally then
// resets for the next set. This makes match completion respect SetsToWin
// rather than counting raw game wins globally.
func (e *ScoringEngine) countSetWins(games []GameResult) (int32, int32) {
	gamesToWin := e.config.GamesToWin()
	if gamesToWin < 1 {
		gamesToWin = 1
	}

	var setWins1, setWins2 int32
	var gameWins1, gameWins2 int32
	for _, g := range games {
		switch g.Winner {
		case 1:
			gameWins1++
		case 2:
			gameWins2++
		}

		if gameWins1 >= gamesToWin {
			setWins1++
			gameWins1, gameWins2 = 0, 0
		} else if gameWins2 >= gamesToWin {
			setWins2++
			gameWins1, gameWins2 = 0, 0
		}
	}
	return setWins1, setWins2
}
