package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func defaultSideOutConfig() ScoringConfig {
	cfg, _ := ParseScoringConfig(SideOutScoring, 11, 2, 0, 1, 1, 0)
	return cfg
}

func defaultRallyConfig() ScoringConfig {
	cfg, _ := ParseScoringConfig(RallyScoring, 25, 2, 0, 1, 1, 0)
	return cfg
}

func defaultState() MatchState {
	return MatchState{
		TeamOneScore:   0,
		TeamTwoScore:   0,
		ServingTeam:    1,
		ServerNumber:   1,
		CurrentGameNum: 1,
		CompletedGames: nil,
		Status:         StatusInProgress,
	}
}

// --- Side-out scoring tests ---

func TestSideOut_ServingTeamScores(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.Point(state, 1) // Team 1 serving, team 1 scores
	require.False(t, result.IsError, result.ErrorMessage)
	assert.Equal(t, int32(1), result.State.TeamOneScore)
	assert.Equal(t, int32(0), result.State.TeamTwoScore)
	assert.Equal(t, int32(1), result.State.ServingTeam, "serving team should not change")
}

func TestSideOut_NonServingTeamCannotScore(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState() // Team 1 serving

	result := eng.Point(state, 2) // Team 2 tries to score
	assert.True(t, result.IsError)
	assert.Contains(t, result.ErrorMessage, "only the serving team can score")
}

func TestSideOut_Rotation_Server1To2(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.ServerNumber = 1

	result := eng.SideOut(state)
	require.False(t, result.IsError)
	assert.Equal(t, int32(1), result.State.ServingTeam, "same team keeps serve")
	assert.Equal(t, int32(2), result.State.ServerNumber, "server should advance to 2")
}

func TestSideOut_Rotation_Server2SwitchTeam(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.ServerNumber = 2

	result := eng.SideOut(state)
	require.False(t, result.IsError)
	assert.Equal(t, int32(2), result.State.ServingTeam, "serve should switch to team 2")
	assert.Equal(t, int32(1), result.State.ServerNumber, "server should reset to 1")
}

func TestSideOut_Rotation_Team2Server2SwitchToTeam1(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.ServingTeam = 2
	state.ServerNumber = 2

	result := eng.SideOut(state)
	require.False(t, result.IsError)
	assert.Equal(t, int32(1), result.State.ServingTeam, "serve should switch to team 1")
	assert.Equal(t, int32(1), result.State.ServerNumber, "server should reset to 1")
}

// --- Rally scoring tests ---

func TestRally_EitherTeamCanScore(t *testing.T) {
	eng := NewScoringEngine(defaultRallyConfig())
	state := defaultState()

	// Team 1 scores
	r1 := eng.Point(state, 1)
	require.False(t, r1.IsError)
	assert.Equal(t, int32(1), r1.State.TeamOneScore)
	assert.Equal(t, int32(1), r1.State.ServingTeam, "scorer serves next")

	// Team 2 scores from the resulting state
	r2 := eng.Point(r1.State, 2)
	require.False(t, r2.IsError)
	assert.Equal(t, int32(1), r2.State.TeamTwoScore)
	assert.Equal(t, int32(2), r2.State.ServingTeam, "scorer serves next")
}

func TestRally_ServiceFollowsScorer(t *testing.T) {
	eng := NewScoringEngine(defaultRallyConfig())
	state := defaultState()
	state.ServingTeam = 1

	// Team 2 scores despite team 1 serving (allowed in rally)
	result := eng.Point(state, 2)
	require.False(t, result.IsError)
	assert.Equal(t, int32(2), result.State.ServingTeam)
}

// --- Game over detection ---

func TestGameOverDetected_WinBy2(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 10
	state.TeamTwoScore = 8

	result := eng.Point(state, 1) // 11-8, win by 3 >= 2
	require.False(t, result.IsError)
	assert.True(t, result.GameOverDetected)
	assert.Equal(t, int32(11), result.State.TeamOneScore)
}

func TestGameOver_NotDetected_InsufficientMargin(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 10
	state.TeamTwoScore = 10

	result := eng.Point(state, 1) // 11-10, only up by 1
	require.False(t, result.IsError)
	assert.False(t, result.GameOverDetected, "need win by 2")
}

func TestGameOver_Deuce_Resolved(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 12
	state.TeamTwoScore = 11

	result := eng.Point(state, 1) // 13-11, win by 2
	require.False(t, result.IsError)
	assert.True(t, result.GameOverDetected)
}

// --- Match over detection ---

func TestMatchOverDetected_SingleGame(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 10
	state.TeamTwoScore = 5

	result := eng.Point(state, 1) // 11-5
	require.False(t, result.IsError)
	assert.True(t, result.GameOverDetected)
	assert.True(t, result.MatchOverDetected, "single game match = game over is match over")
}

func TestMatchOverDetected_BestOf3(t *testing.T) {
	cfg, _ := ParseScoringConfig(SideOutScoring, 11, 2, 0, 3, 1, 0)
	eng := NewScoringEngine(cfg)

	// Team 1 already won game 1
	state := defaultState()
	state.CompletedGames = []GameResult{
		{GameNum: 1, TeamOneScore: 11, TeamTwoScore: 5, Winner: 1},
	}
	state.CurrentGameNum = 2
	state.TeamOneScore = 10
	state.TeamTwoScore = 3

	result := eng.Point(state, 1) // 11-3, team 1 wins game 2 -> 2 wins = match
	require.False(t, result.IsError)
	assert.True(t, result.GameOverDetected)
	assert.True(t, result.MatchOverDetected)
}

func TestMatchNotOver_BestOf3_OneWinEach(t *testing.T) {
	cfg, _ := ParseScoringConfig(SideOutScoring, 11, 2, 0, 3, 1, 0)
	eng := NewScoringEngine(cfg)

	// Team 1 won game 1, team 2 won game 2
	state := defaultState()
	state.CompletedGames = []GameResult{
		{GameNum: 1, TeamOneScore: 11, TeamTwoScore: 5, Winner: 1},
	}
	state.CurrentGameNum = 2
	state.TeamTwoScore = 10
	state.TeamOneScore = 3
	state.ServingTeam = 2

	result := eng.Point(state, 2) // Team 2 wins game 2
	require.False(t, result.IsError)
	assert.True(t, result.GameOverDetected)
	assert.False(t, result.MatchOverDetected, "1-1 in games, need game 3")
}

func TestMatchOver_SetsToWin_RequiresMultipleSets(t *testing.T) {
	// Best-of-3 SETS where each set is a single game (GamesPerSet=1 -> 1 game per set).
	// A team must win 2 sets (i.e. 2 games) to win the match; winning the first
	// set/game must NOT end the match.
	cfg, _ := ParseScoringConfig(SideOutScoring, 11, 2, 0, 1, 2, 0)
	eng := NewScoringEngine(cfg)

	// Win the first set (game 1).
	state := defaultState()
	state.TeamOneScore = 10
	state.TeamTwoScore = 5

	result := eng.Point(state, 1) // 11-5, team 1 wins game 1
	require.False(t, result.IsError)
	assert.True(t, result.GameOverDetected)
	assert.False(t, result.MatchOverDetected, "winning only the first of two required sets must not end the match")

	// Win the second set (game 2) -> 2 sets -> match over.
	state2 := defaultState()
	state2.CompletedGames = []GameResult{
		{GameNum: 1, TeamOneScore: 11, TeamTwoScore: 5, Winner: 1},
	}
	state2.CurrentGameNum = 2
	state2.TeamOneScore = 10
	state2.TeamTwoScore = 8

	result2 := eng.Point(state2, 1) // 11-8, team 1 wins game 2 -> 2 sets
	require.False(t, result2.IsError)
	assert.True(t, result2.GameOverDetected)
	assert.True(t, result2.MatchOverDetected, "winning both required sets must end the match")
}

// --- End change detection ---

func TestEndChangeDetected(t *testing.T) {
	cfg, _ := ParseScoringConfig(SideOutScoring, 11, 2, 0, 1, 1, 0)
	eng := NewScoringEngine(cfg)

	state := defaultState()
	state.TeamOneScore = 5
	state.TeamTwoScore = 3

	result := eng.Point(state, 1) // 6-3, midpoint of 11 is 6
	require.False(t, result.IsError)
	assert.True(t, result.EndChangeDetected)
}

func TestEndChangeNotDetected_BeforeMidpoint(t *testing.T) {
	cfg, _ := ParseScoringConfig(SideOutScoring, 11, 2, 0, 1, 1, 0)
	eng := NewScoringEngine(cfg)

	state := defaultState()
	state.TeamOneScore = 4
	state.TeamTwoScore = 3

	result := eng.Point(state, 1) // 5-3
	require.False(t, result.IsError)
	assert.False(t, result.EndChangeDetected)
}

// --- Remove point ---

func TestRemovePoint_Team1(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 5

	result := eng.RemovePoint(state, 1, 1, 1)
	require.False(t, result.IsError)
	assert.Equal(t, int32(4), result.State.TeamOneScore)
}

func TestRemovePoint_Team2(t *testing.T) {
	eng := NewScoringEngine(defaultRallyConfig())
	state := defaultState()
	state.TeamTwoScore = 10

	result := eng.RemovePoint(state, 2, 2, 1)
	require.False(t, result.IsError)
	assert.Equal(t, int32(9), result.State.TeamTwoScore)
	assert.Equal(t, int32(2), result.State.ServingTeam, "serving should restore")
}

func TestRemovePoint_AlreadyZero(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.RemovePoint(state, 1, 1, 1)
	assert.True(t, result.IsError)
	assert.Contains(t, result.ErrorMessage, "already 0")
}

// --- Confirm game over ---

func TestConfirmGameOver(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 11
	state.TeamTwoScore = 5
	state.CompletedGames = []GameResult{
		{GameNum: 1, TeamOneScore: 11, TeamTwoScore: 5, Winner: 1},
	}

	result := eng.ConfirmGameOver(state)
	require.False(t, result.IsError)
	assert.Equal(t, int32(0), result.State.TeamOneScore, "scores reset")
	assert.Equal(t, int32(0), result.State.TeamTwoScore, "scores reset")
	assert.Equal(t, int32(2), result.State.CurrentGameNum, "advanced to game 2")
	assert.Equal(t, int32(2), result.State.ServingTeam, "loser serves next game")
	assert.Equal(t, int32(1), result.State.ServerNumber, "server resets")
}

func TestConfirmGameOver_NoCompletedGame(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.ConfirmGameOver(state)
	assert.True(t, result.IsError)
	assert.Contains(t, result.ErrorMessage, "no completed game")
}

// --- Confirm match over ---

func TestConfirmMatchOver(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.ConfirmMatchOver(state)
	require.False(t, result.IsError)
	assert.Equal(t, StatusCompleted, result.State.Status)
}

func TestConfirmMatchOver_NotInProgress(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.Status = StatusCompleted

	result := eng.ConfirmMatchOver(state)
	assert.True(t, result.IsError)
}

// --- Timeout ---

func TestTimeout(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.Timeout(state, 1)
	require.False(t, result.IsError)
}

func TestTimeout_InvalidTeam(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.Timeout(state, 3)
	assert.True(t, result.IsError)
}

// --- Pause/Resume ---

func TestPauseAndResume(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	paused := eng.Pause(state)
	require.False(t, paused.IsError)
	assert.Equal(t, StatusPaused, paused.State.Status)
	assert.True(t, paused.State.IsPaused)

	resumed := eng.Resume(paused.State)
	require.False(t, resumed.IsError)
	assert.Equal(t, StatusInProgress, resumed.State.Status)
	assert.False(t, resumed.State.IsPaused)
}

func TestPause_NotInProgress(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.Status = StatusCompleted

	result := eng.Pause(state)
	assert.True(t, result.IsError)
}

func TestResume_NotPaused(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.Resume(state)
	assert.True(t, result.IsError)
}

// --- Forfeit ---

func TestForfeit(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.Forfeit(state, 2)
	require.False(t, result.IsError)
	assert.Equal(t, StatusForfeited, result.State.Status)
}

func TestForfeit_FromPaused(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.Status = StatusPaused

	result := eng.Forfeit(state, 1)
	require.False(t, result.IsError)
	assert.Equal(t, StatusForfeited, result.State.Status)
}

func TestForfeit_InvalidStatus(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.Status = StatusCompleted

	result := eng.Forfeit(state, 1)
	assert.True(t, result.IsError)
}

func TestForfeit_InvalidTeam(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()

	result := eng.Forfeit(state, 3)
	assert.True(t, result.IsError)
}

// --- ScoreCall ---

func TestScoreCall(t *testing.T) {
	eng := NewScoringEngine(defaultSideOutConfig())
	state := defaultState()
	state.TeamOneScore = 5
	state.TeamTwoScore = 3
	state.ServerNumber = 2

	call := eng.ScoreCall(state)
	assert.Equal(t, "5-3-2", call)
}
