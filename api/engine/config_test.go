package engine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseScoringConfig_ValidSideOut(t *testing.T) {
	cfg, err := ParseScoringConfig(SideOutScoring, 11, 2, 0, 1, 1, 0)
	require.NoError(t, err)
	assert.Equal(t, SideOutScoring, cfg.ScoringType)
	assert.Equal(t, int32(11), cfg.PointsToWin)
	assert.Equal(t, int32(2), cfg.WinBy)
	assert.Equal(t, int32(0), cfg.MaxPoints)
	assert.Equal(t, int32(1), cfg.GamesPerSet)
	assert.Equal(t, int32(1), cfg.SetsToWin)
}

func TestParseScoringConfig_ValidRally(t *testing.T) {
	cfg, err := ParseScoringConfig(RallyScoring, 25, 2, 30, 3, 2, 0)
	require.NoError(t, err)
	assert.Equal(t, RallyScoring, cfg.ScoringType)
	assert.Equal(t, int32(25), cfg.PointsToWin)
	assert.Equal(t, int32(30), cfg.MaxPoints)
}

func TestParseScoringConfig_InvalidType(t *testing.T) {
	_, err := ParseScoringConfig("bogus", 11, 2, 0, 1, 1, 0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid scoring type")
}

func TestParseScoringConfig_Defaults(t *testing.T) {
	cfg, err := ParseScoringConfig("", 0, 0, 0, 0, 0, 0)
	require.NoError(t, err)
	assert.Equal(t, SideOutScoring, cfg.ScoringType)
	assert.Equal(t, int32(11), cfg.PointsToWin)
	assert.Equal(t, int32(2), cfg.WinBy)
	assert.Equal(t, int32(1), cfg.GamesPerSet)
	assert.Equal(t, int32(1), cfg.SetsToWin)
}

func TestGamesToWin(t *testing.T) {
	tests := []struct {
		gamesPerSet int32
		want        int32
	}{
		{1, 1},
		{3, 2},
		{5, 3},
	}
	for _, tt := range tests {
		cfg := ScoringConfig{GamesPerSet: tt.gamesPerSet}
		assert.Equal(t, tt.want, cfg.GamesToWin(), "gamesPerSet=%d", tt.gamesPerSet)
	}
}

func TestIsGameOver(t *testing.T) {
	cfg := ScoringConfig{PointsToWin: 11, WinBy: 2, MaxPoints: 0}

	// Not enough points
	assert.False(t, cfg.IsGameOver(10, 8))
	// Win by 2
	assert.True(t, cfg.IsGameOver(11, 9))
	// At 11 but only up by 1
	assert.False(t, cfg.IsGameOver(11, 10))
	// Deuce resolved
	assert.True(t, cfg.IsGameOver(13, 11))
}

func TestIsGameOver_WithMaxPoints(t *testing.T) {
	cfg := ScoringConfig{PointsToWin: 11, WinBy: 2, MaxPoints: 15}

	// At max points cap, don't need win-by-2
	assert.True(t, cfg.IsGameOver(15, 14))
	// Below cap, still need win-by-2
	assert.False(t, cfg.IsGameOver(14, 13))
}

func TestIsEndChange_DecidingGame(t *testing.T) {
	cfg := ScoringConfig{PointsToWin: 11, WinBy: 2, GamesPerSet: 3, SetsToWin: 1}
	// Deciding game is game 3 (2*2-1 = 3). Midpoint = 6.

	// Not the deciding game
	assert.False(t, cfg.IsEndChange(6, 0, 1, 0))

	// Deciding game, leading team at midpoint
	assert.True(t, cfg.IsEndChange(6, 4, 3, 2))

	// Deciding game, not yet at midpoint
	assert.False(t, cfg.IsEndChange(5, 4, 3, 2))
}

func TestIsEndChange_SingleGame(t *testing.T) {
	cfg := ScoringConfig{PointsToWin: 11, WinBy: 2, GamesPerSet: 1, SetsToWin: 1}
	// Deciding game is game 1. Midpoint = 6.

	assert.True(t, cfg.IsEndChange(6, 3, 1, 0))
	assert.False(t, cfg.IsEndChange(5, 3, 1, 0))
}

func TestIsEndChange_DoesNotFireTwiceInDeuce(t *testing.T) {
	cfg := ScoringConfig{PointsToWin: 11, WinBy: 2, GamesPerSet: 1, SetsToWin: 1}
	// Deciding game is game 1. Midpoint = 6.

	// First team to reach the midpoint triggers the end change exactly once.
	assert.True(t, cfg.IsEndChange(6, 5, 1, 0), "should fire when team1 first reaches midpoint")
	assert.True(t, cfg.IsEndChange(5, 6, 1, 0), "should fire when team2 first reaches midpoint")

	// Once the trailing team also reaches the midpoint, the end change must NOT
	// fire a second time (the previous implementation re-fired at 6-6).
	assert.False(t, cfg.IsEndChange(6, 6, 1, 0), "must NOT fire again at 6-6")

	// Past the midpoint, no fire.
	assert.False(t, cfg.IsEndChange(7, 6, 1, 0), "past the midpoint: no fire")
	assert.False(t, cfg.IsEndChange(7, 5, 1, 0), "leader past midpoint: no fire")
}
