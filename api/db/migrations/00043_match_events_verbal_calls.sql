-- +goose Up
-- PR-13 (smoke 11.5): The referee console can now record verbal officiating
-- calls (let / re-do / fault / line call) as match events that annotate the
-- timeline without mutating the score. The match_events.event_type CHECK
-- constraint (last set in 00031) accepted legacy 'fault' but not 'let',
-- 're_do', or 'line_call', so recording those rulings would explode at the
-- database with a generic 500. This migration widens the CHECK to include the
-- canonical verbal-call types defined in api/service/events.go (EventTypeLet,
-- EventTypeReDo, EventTypeFault, EventTypeLineCall) while retaining every
-- previously-accepted value for backward compatibility with existing rows.
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_event_type_check;

ALTER TABLE match_events ADD CONSTRAINT match_events_event_type_check
    CHECK (event_type IN (
        -- Canonical CR-1 event types (see api/service/events.go).
        'match_started',
        'match_paused',
        'match_resumed',
        'match_complete',
        'match_reset',
        'point_team1',
        'point_team2',
        'point_removed',
        'side_out',
        'undo',
        'game_complete',
        'confirm_game_over',
        'confirm_match_over',
        'timeout',
        'timeout_ended',
        'end_change',
        'substitution',
        'match_configured',
        'score_override',
        'forfeit_declared',

        -- Officiating / verbal calls (PR-13, see api/service/events.go).
        'let',
        're_do',
        'fault',
        'line_call',

        -- Legacy values still accepted for historical rows created before CR-1.
        'timeout_team1',
        'timeout_team2',
        'end_timeout',
        'start_set',
        'end_set',
        'start_game',
        'end_game',
        'challenge',
        'note',
        'custom'
    ));

-- +goose Down
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_event_type_check;

ALTER TABLE match_events ADD CONSTRAINT match_events_event_type_check
    CHECK (event_type IN (
        -- Canonical CR-1 event types (see api/service/events.go).
        'match_started',
        'match_paused',
        'match_resumed',
        'match_complete',
        'match_reset',
        'point_team1',
        'point_team2',
        'point_removed',
        'side_out',
        'undo',
        'game_complete',
        'confirm_game_over',
        'confirm_match_over',
        'timeout',
        'timeout_ended',
        'end_change',
        'substitution',
        'match_configured',
        'score_override',
        'forfeit_declared',

        -- Legacy values still accepted for historical rows created before CR-1.
        'timeout_team1',
        'timeout_team2',
        'end_timeout',
        'start_set',
        'end_set',
        'start_game',
        'end_game',
        'challenge',
        'fault',
        'note',
        'custom'
    ));
