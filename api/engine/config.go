package engine

import "fmt"

// ScoringType defines the scoring system for a match.
type ScoringType string

const (
	// SideOutScoring means only the serving team can score.
	SideOutScoring ScoringType = "side_out"

	// RallyScoring means either team can score on any rally.
	RallyScoring ScoringType = "rally"
)

// ScoringConfig holds the rules for a match.
type ScoringConfig struct {
	ScoringType ScoringType `json:"scoring_type"`
	PointsToWin int32       `json:"points_to_win"`
	WinBy       int32       `json:"win_by"`
	MaxPoints   int32       `json:"max_points"`    // 0 means no cap
	GamesPerSet int32       `json:"games_per_set"` // games in a set (used for best-of calculation)
	SetsToWin   int32       `json:"sets_to_win"`   // sets needed to win the match
	FreezeAt    int32       `json:"freeze_at"`     // 0 means no freeze
}

// ParseScoringConfig validates and returns a ScoringConfig with defaults applied.
func ParseScoringConfig(scoringType ScoringType, pointsToWin, winBy, maxPoints, gamesPerSet, setsToWin, freezeAt int32) (ScoringConfig, error) {
	if scoringType == "" {
		scoringType = SideOutScoring
	}
	if scoringType != SideOutScoring && scoringType != RallyScoring {
		return ScoringConfig{}, fmt.Errorf("invalid scoring type: %q", scoringType)
	}

	if pointsToWin <= 0 {
		pointsToWin = 11
	}
	if winBy <= 0 {
		winBy = 2
	}
	if gamesPerSet <= 0 {
		gamesPerSet = 1
	}
	if setsToWin <= 0 {
		setsToWin = 1
	}

	return ScoringConfig{
		ScoringType: scoringType,
		PointsToWin: pointsToWin,
		WinBy:       winBy,
		MaxPoints:   maxPoints,
		GamesPerSet: gamesPerSet,
		SetsToWin:   setsToWin,
		FreezeAt:    freezeAt,
	}, nil
}

// GamesToWin returns how many games a team needs to win a set.
// For best-of-N, it's ceil(N/2). E.g. gamesPerSet=3 -> need 2 wins.
func (c ScoringConfig) GamesToWin() int32 {
	return (c.GamesPerSet + 1) / 2
}

// IsGameOver returns true if a team's score is enough to win the current game.
func (c ScoringConfig) IsGameOver(teamScore, opponentScore int32) bool {
	if teamScore < c.PointsToWin {
		return false
	}

	// If max_points cap is set and reached, the leading team wins.
	if c.MaxPoints > 0 && teamScore >= c.MaxPoints {
		return true
	}

	// Must win by the required margin.
	return (teamScore - opponentScore) >= c.WinBy
}

// IsEndChange returns true if teams should switch ends.
// In pickleball, this happens when the combined score is a multiple of
// the freeze_at value, or when the leading team reaches a certain threshold.
// For simplicity: end change occurs every N total points where N = points_to_win
// (i.e. roughly halfway). We use a simple rule: switch when total points
// hits multiples of PointsToWin. But the most common convention is to switch
// at the midpoint of the final game. We'll implement the standard:
// switch sides when the leading team reaches ceil(pointsToWin/2) in the deciding game.
func (c ScoringConfig) IsEndChange(team1Score, team2Score, currentGameNum int32, totalGamesPlayed int32) bool {
	// Only do end changes in the deciding game (the last possible game).
	// The deciding game number = 2*GamesToWin() - 1
	decidingGame := 2*c.GamesToWin() - 1
	if currentGameNum != decidingGame {
		return false
	}

	midpoint := (c.PointsToWin + 1) / 2

	// Fire exactly once: only when one team newly reaches the midpoint while the
	// other is still strictly below it. Because scores increment by exactly one
	// point at a time, the scoring team always lands precisely on the midpoint,
	// so this fires at 6-5 (or 5-6) but NOT again at 6-6, 7-6, etc.
	return (team1Score == midpoint && team2Score < midpoint) ||
		(team2Score == midpoint && team1Score < midpoint)
}
