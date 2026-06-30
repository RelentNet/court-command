package bracket

import (
	"fmt"
	"math"
	"math/bits"
	"sort"
)

// SeedEntry represents a seeded participant in a bracket.
type SeedEntry struct {
	Seed   int   // 1-based seed number
	TeamID int64 // 0 means BYE
}

// BracketMatch represents a single match in a generated bracket.
type BracketMatch struct {
	MatchNumber   int // 1-based match number within the bracket
	Round         int // 1-based round number
	RoundName     string
	Team1Seed     int // 0 = TBD (filled by prior match)
	Team2Seed     int // 0 = TBD
	Team1TeamID   int64
	Team2TeamID   int64
	IsBye         bool // true if one side is a BYE (auto-advance)
	ByeWinnerSeed int  // the seed that auto-advances, 0 if not a bye

	// Wiring: which match the winner/loser feeds into
	NextMatchNumber      int // 0 = finals (no next)
	NextMatchSlot        int // 1 or 2 (team1 or team2 slot in next match)
	LoserNextMatchNumber int // for double elimination losers bracket
	LoserNextMatchSlot   int
}

// nextPowerOfTwo returns the smallest power of 2 >= n.
// Uses bit manipulation for exact integer results (no floating-point imprecision).
func nextPowerOfTwo(n int) int {
	if n <= 1 {
		return 1
	}
	return 1 << bits.Len(uint(n-1))
}

// GenerateSingleElimination creates a single-elimination bracket.
// entries must be sorted by seed (1 = best). If len(entries) is not a
// power of two, BYEs are inserted so top seeds get them.
func GenerateSingleElimination(entries []SeedEntry) ([]BracketMatch, error) {
	n := len(entries)
	if n < 2 {
		return nil, fmt.Errorf("need at least 2 entries, got %d", n)
	}

	bracketSize := nextPowerOfTwo(n)
	numRounds := int(math.Log2(float64(bracketSize)))

	// Sort entries by seed ascending
	sorted := make([]SeedEntry, len(entries))
	copy(sorted, entries)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Seed < sorted[j].Seed
	})

	// Create seeding with BYEs. BYEs go to the bottom seeds' opponents
	// (i.e., top seeds get byes). We use standard bracket seeding order.
	seeds := make([]SeedEntry, bracketSize)
	for i, e := range sorted {
		seeds[i] = e
	}
	for i := n; i < bracketSize; i++ {
		seeds[i] = SeedEntry{Seed: 0, TeamID: 0} // BYE
	}

	// Generate standard bracket seeding order for proper matchups:
	// Seed 1 vs last, seed 2 vs second-to-last, etc.
	order := bracketSeedOrder(bracketSize)

	// Map seed positions to entries
	positioned := make([]SeedEntry, bracketSize)
	for i, pos := range order {
		if pos-1 < len(seeds) {
			positioned[i] = seeds[pos-1]
		}
	}

	// Generate matches round by round
	var matches []BracketMatch
	matchNum := 0

	// Track which match feeds into the next round
	// prevRoundMatches[i] = match number of the i-th match in previous round
	var prevRoundMatches []int

	totalFirstRoundMatches := bracketSize / 2

	for round := 1; round <= numRounds; round++ {
		matchesInRound := bracketSize / int(math.Pow(2, float64(round)))

		var currentRoundMatches []int

		for i := 0; i < matchesInRound; i++ {
			matchNum++
			bm := BracketMatch{
				MatchNumber: matchNum,
				Round:       round,
				RoundName:   roundName(round, numRounds),
			}

			if round == 1 {
				// First round: assign from positioned seeds
				idx1 := i * 2
				idx2 := i*2 + 1
				s1 := positioned[idx1]
				s2 := positioned[idx2]

				bm.Team1Seed = s1.Seed
				bm.Team2Seed = s2.Seed
				bm.Team1TeamID = s1.TeamID
				bm.Team2TeamID = s2.TeamID

				// Check for BYE
				if s1.Seed == 0 || s2.Seed == 0 {
					bm.IsBye = true
					if s1.Seed != 0 {
						bm.ByeWinnerSeed = s1.Seed
					} else {
						bm.ByeWinnerSeed = s2.Seed
					}
				}
			} else {
				// Later rounds: teams come from winners of previous round
				// The two feeder matches for this match are at indices i*2 and i*2+1
				// in the previous round's match list
				feeder1Idx := i * 2
				feeder2Idx := i*2 + 1

				if feeder1Idx < len(prevRoundMatches) {
					// Already wired via NextMatchNumber below
				}
				if feeder2Idx < len(prevRoundMatches) {
					// Already wired
				}
			}

			// Wire to next round
			if round < numRounds {
				nextRoundMatchOffset := totalFirstRoundMatches
				for r := 2; r <= round; r++ {
					nextRoundMatchOffset += bracketSize / int(math.Pow(2, float64(r)))
				}
				nextMatchIdx := i / 2
				bm.NextMatchNumber = nextRoundMatchOffset + nextMatchIdx + 1
				if i%2 == 0 {
					bm.NextMatchSlot = 1
				} else {
					bm.NextMatchSlot = 2
				}
			}

			currentRoundMatches = append(currentRoundMatches, matchNum)
			matches = append(matches, bm)
		}

		prevRoundMatches = currentRoundMatches
	}

	return matches, nil
}

// GenerateDoubleElimination creates a double-elimination bracket.
// Winners bracket + losers bracket + grand finals.
func GenerateDoubleElimination(entries []SeedEntry) ([]BracketMatch, error) {
	n := len(entries)
	if n < 2 {
		return nil, fmt.Errorf("need at least 2 entries, got %d", n)
	}

	// Generate the winners bracket first
	winnerMatches, err := GenerateSingleElimination(entries)
	if err != nil {
		return nil, fmt.Errorf("generating winners bracket: %w", err)
	}

	bracketSize := nextPowerOfTwo(n)
	numWinnerRounds := int(math.Log2(float64(bracketSize)))

	// Calculate losers bracket structure:
	// Losers bracket has (numWinnerRounds - 1) * 2 rounds
	// Each winners bracket round (except the first) feeds one loser into the losers bracket
	numLoserRounds := (numWinnerRounds - 1) * 2
	if numLoserRounds < 1 {
		numLoserRounds = 1
	}

	matchNum := len(winnerMatches)
	var loserMatches []BracketMatch

	// Simple losers bracket: losers from winners bracket round R feed into
	// losers bracket. The detailed wiring depends on bracket size, but we
	// create a simplified version that creates the right number of matches.

	// Losers bracket round 1: losers from WB round 1
	losersInRound := bracketSize / 2 // number of losers from WB round 1
	// But they play in pairs, so matches = losersInRound / 2
	loserMatchesInFirstRound := losersInRound / 2

	var prevLoserMatches []int
	// Track the index (into loserMatches) of each match, grouped by losers
	// round, so we can wire the internal progression round-by-round below.
	var loserRoundIdx [][]int

	for lRound := 1; lRound <= numLoserRounds; lRound++ {
		var matchesThisRound int
		if lRound == 1 {
			matchesThisRound = loserMatchesInFirstRound
		} else if lRound%2 == 0 {
			// Even losers rounds: survivors play losers dropping from winners bracket
			matchesThisRound = len(prevLoserMatches)
		} else {
			// Odd losers rounds (after first): halve the field
			matchesThisRound = len(prevLoserMatches) / 2
			if matchesThisRound < 1 {
				matchesThisRound = 1
			}
		}

		var currentLoserMatches []int
		var currentRoundIdx []int
		for i := 0; i < matchesThisRound; i++ {
			matchNum++
			lm := BracketMatch{
				MatchNumber: matchNum,
				Round:       numWinnerRounds + lRound,
				RoundName:   fmt.Sprintf("Losers Round %d", lRound),
			}

			currentRoundIdx = append(currentRoundIdx, len(loserMatches))
			currentLoserMatches = append(currentLoserMatches, matchNum)
			loserMatches = append(loserMatches, lm)
		}
		prevLoserMatches = currentLoserMatches
		loserRoundIdx = append(loserRoundIdx, currentRoundIdx)
	}

	// Wire losers bracket internal progression round-by-round. Each match in
	// losers round r feeds its winner into a match in losers round r+1; the
	// last losers round's match is the LB final and is wired to grand finals
	// separately below.
	//
	// Slot convention (chosen so an LB survivor never collides with a winners
	// bracket dropout landing in the same destination):
	//   - When the next round halves the field (minor round: survivors meet
	//     each other), match i maps to match i/2 with slot from parity.
	//   - When the next round keeps the same match count (major round:
	//     survivor meets an incoming winners bracket dropout), match i maps to
	//     match i and the survivor always takes slot 1, reserving slot 2 for
	//     the dropout.
	for r := 0; r < len(loserRoundIdx)-1; r++ {
		curr := loserRoundIdx[r]
		next := loserRoundIdx[r+1]
		halving := len(next) < len(curr)
		for i, idx := range curr {
			if halving {
				destIdx := next[i/2]
				loserMatches[idx].NextMatchNumber = loserMatches[destIdx].MatchNumber
				if i%2 == 0 {
					loserMatches[idx].NextMatchSlot = 1
				} else {
					loserMatches[idx].NextMatchSlot = 2
				}
			} else {
				destIdx := next[i]
				loserMatches[idx].NextMatchNumber = loserMatches[destIdx].MatchNumber
				loserMatches[idx].NextMatchSlot = 1
			}
		}
	}

	// Wire winners bracket losers to losers bracket
	for i := range winnerMatches {
		if winnerMatches[i].Round == 1 && len(loserMatches) > 0 {
			loserIdx := i / 2
			if loserIdx < len(loserMatches) {
				winnerMatches[i].LoserNextMatchNumber = loserMatches[loserIdx].MatchNumber
				if i%2 == 0 {
					winnerMatches[i].LoserNextMatchSlot = 1
				} else {
					winnerMatches[i].LoserNextMatchSlot = 2
				}
			}
		}
	}

	// Grand Finals: WB winner vs LB winner
	matchNum++
	grandFinals := BracketMatch{
		MatchNumber: matchNum,
		Round:       numWinnerRounds + numLoserRounds + 1,
		RoundName:   "Grand Finals",
	}

	// Wire WB finals winner to grand finals slot 1
	wbFinals := &winnerMatches[len(winnerMatches)-1]
	wbFinals.NextMatchNumber = matchNum
	wbFinals.NextMatchSlot = 1

	// Wire grand finals slot 2: normally fed by the LB final winner. With only a
	// single winners-bracket round (e.g. exactly 2 teams) there are no losers
	// bracket matches, so the WB final's loser is the "losers bracket" and must
	// feed grand finals slot 2 directly. Without this, slot 2 can never be
	// filled and the event cannot complete.
	if len(loserMatches) > 0 {
		lbFinals := &loserMatches[len(loserMatches)-1]
		lbFinals.NextMatchNumber = matchNum
		lbFinals.NextMatchSlot = 2
	} else {
		wbFinals.LoserNextMatchNumber = matchNum
		wbFinals.LoserNextMatchSlot = 2
	}

	// Combine all matches
	all := make([]BracketMatch, 0, len(winnerMatches)+len(loserMatches)+1)
	all = append(all, winnerMatches...)
	all = append(all, loserMatches...)
	all = append(all, grandFinals)

	return all, nil
}

// GenerateRoundRobin creates a round-robin schedule where every entry
// plays every other entry exactly once. Uses the circle method for
// even-count scheduling.
func GenerateRoundRobin(entries []SeedEntry) ([]BracketMatch, error) {
	n := len(entries)
	if n < 2 {
		return nil, fmt.Errorf("need at least 2 entries, got %d", n)
	}

	// If odd number of entries, add a BYE entry
	participants := make([]SeedEntry, len(entries))
	copy(participants, entries)
	if n%2 != 0 {
		participants = append(participants, SeedEntry{Seed: 0, TeamID: 0})
		n = len(participants)
	}

	numRounds := n - 1
	matchesPerRound := n / 2

	var matches []BracketMatch
	matchNum := 0

	// Circle method: fix position 0, rotate others
	indices := make([]int, n)
	for i := range indices {
		indices[i] = i
	}

	for round := 1; round <= numRounds; round++ {
		for match := 0; match < matchesPerRound; match++ {
			home := indices[match]
			away := indices[n-1-match]

			p1 := participants[home]
			p2 := participants[away]

			// Skip BYE matches
			if p1.Seed == 0 || p2.Seed == 0 {
				continue
			}

			matchNum++
			bm := BracketMatch{
				MatchNumber: matchNum,
				Round:       round,
				RoundName:   fmt.Sprintf("Round %d", round),
				Team1Seed:   p1.Seed,
				Team2Seed:   p2.Seed,
				Team1TeamID: p1.TeamID,
				Team2TeamID: p2.TeamID,
			}
			matches = append(matches, bm)
		}

		// Rotate: keep indices[0] fixed, rotate the rest
		last := indices[n-1]
		copy(indices[2:], indices[1:n-1])
		indices[1] = last
	}

	return matches, nil
}

// bracketSeedOrder returns the standard bracket position order for a given
// bracket size. For size=8: [1,8,4,5,2,7,3,6] so that seed 1 plays seed 8,
// seed 4 plays seed 5, etc.
func bracketSeedOrder(size int) []int {
	if size == 1 {
		return []int{1}
	}
	if size == 2 {
		return []int{1, 2}
	}

	// Recursive construction
	half := bracketSeedOrder(size / 2)
	result := make([]int, size)
	for i, seed := range half {
		result[i*2] = seed
		result[i*2+1] = size + 1 - seed
	}
	return result
}

// roundName returns a human-readable name for the round.
func roundName(round, totalRounds int) string {
	remaining := totalRounds - round
	switch remaining {
	case 0:
		return "Finals"
	case 1:
		return "Semifinals"
	case 2:
		return "Quarterfinals"
	default:
		return fmt.Sprintf("Round %d", round)
	}
}
