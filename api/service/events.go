// Package service — canonical match event type constants.
//
// These constants are the SINGLE source of truth for event_type string values
// written to `match_events.event_type` and read back by services and the
// frontend. Every writer MUST reference a constant from this file; every
// reader MUST compare against a constant from this file.
//
// Canonical casing policy: lowercase snake_case.
//
// Why this file exists: Phase 3 shipped with three layers of drift — writers
// emitted lowercase (`point_team1`, `timeout`), one writer emitted SCREAMING
// (`SCORE_OVERRIDE`), and a reader grepped for `TIMEOUT_CALLED` (never
// written). The frontend EventType union used SCREAMING_SNAKE and silently
// failed `EVENT_META[event_type]` lookups. See
// docs/superpowers/lessons/2026-04-16-phase-3-review-defects.md.
//
// Cross-language invariant: the set of constant values in this file MUST
// exactly match the `EventType` union in
// web/src/features/scoring/types.ts. Drift is caught by
// TestEventTypeConstants_MatchWriters in match_contract_test.go.
package service

// EventType enumerates every event_type value that writers may persist.
// Frontend `EventType` union must match this set exactly.
const (
	// Lifecycle
	EventTypeMatchStarted  = "match_started"
	EventTypeMatchPaused   = "match_paused"
	EventTypeMatchResumed  = "match_resumed"
	EventTypeMatchComplete = "match_complete"
	EventTypeMatchReset    = "match_reset"

	// Scoring
	EventTypePointTeam1       = "point_team1"
	EventTypePointTeam2       = "point_team2"
	EventTypePointRemoved     = "point_removed"
	EventTypeSideOut          = "side_out"
	EventTypeUndo             = "undo"
	EventTypeGameComplete     = "game_complete"
	EventTypeConfirmGameOver  = "confirm_game_over"
	EventTypeConfirmMatchOver = "confirm_match_over"

	// Flow
	EventTypeTimeout      = "timeout"
	EventTypeTimeoutEnd   = "timeout_ended"
	EventTypeEndChange    = "end_change"
	EventTypeSubstitution = "substitution"

	// Admin / configuration
	EventTypeMatchConfigured = "match_configured"
	EventTypeScoreOverride   = "score_override"
	EventTypeForfeitDeclared = "forfeit_declared"

	// Officiating / verbal calls — referee-recorded rulings that annotate the
	// timeline without mutating the score. Written via RecordEvent from the
	// referee console's VerbalsPanel.
	EventTypeLet      = "let"
	EventTypeReDo     = "re_do"
	EventTypeFault    = "fault"
	EventTypeLineCall = "line_call"
)

// AllEventTypes lists every valid event_type value in canonical order.
// Used by contract tests to pin the enum surface.
var AllEventTypes = []string{
	EventTypeMatchStarted,
	EventTypeMatchPaused,
	EventTypeMatchResumed,
	EventTypeMatchComplete,
	EventTypeMatchReset,
	EventTypePointTeam1,
	EventTypePointTeam2,
	EventTypePointRemoved,
	EventTypeSideOut,
	EventTypeUndo,
	EventTypeGameComplete,
	EventTypeConfirmGameOver,
	EventTypeConfirmMatchOver,
	EventTypeTimeout,
	EventTypeTimeoutEnd,
	EventTypeEndChange,
	EventTypeSubstitution,
	EventTypeMatchConfigured,
	EventTypeScoreOverride,
	EventTypeForfeitDeclared,
	EventTypeLet,
	EventTypeReDo,
	EventTypeFault,
	EventTypeLineCall,
}
