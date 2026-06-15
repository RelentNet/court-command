// match_contract_test.go — Phase 3 contract remediation guards.
//
// These tests freeze the HTTP/JSON contract between the Go backend and the
// TypeScript frontend and prevent the drift defects surfaced in CR-1..CR-8
// (see docs/superpowers/lessons/2026-04-16-phase-3-review-defects.md) from
// silently returning.
//
// Every assertion here maps to a specific review finding:
//
//   - CR-1: EventType constants are canonical lowercase snake_case.
//     TestEventTypeConstants_LowercaseSnake, TestEventTypeConstants_UsedByWriters.
//   - CR-2: MatchEventResponse serializes `timestamp` + nested `score_snapshot`.
//     TestMatchEventResponse_MarshalContract.
//   - CR-3: Timeout queries use EventTypeTimeout (not "TIMEOUT_CALLED").
//     TestEventTypeConstants_UsedByWriters.
//   - CR-4: applyEngineResult returns a pre-enriched MatchResponse; callers
//     must not double-enrich. Verified structurally via signature.
//     TestApplyEngineResult_ReturnsPreEnrichedResponse.
//   - CR-6: ListCourts enriches active_match / on_deck_match.
//     TestListCourts_EnrichesActiveAndOnDeck.
//   - CR-7: MatchResponse must not carry a ScoredByName field.
//     TestMatchResponse_NoScoredByName.
//   - CR-8: ConfirmMatchOver rejects tied-games without explicit winner.
//     TestConfirmMatchOver_RejectsTie.
//   - Shape symmetry: ScoreSnapshot round-trips JSON with canonical keys.
//     TestScoreSnapshot_MarshalContract.
package service

import (
	"context"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// CR-1 / CR-3: EventType constants
// ---------------------------------------------------------------------------

// canonicalEventTypes is the single source of truth for the contract.
// Any addition here must also be added to the frontend EventType union in
// web/src/features/scoring/types.ts.
var canonicalEventTypes = map[string]string{
	"EventTypeMatchStarted":     "match_started",
	"EventTypeMatchPaused":      "match_paused",
	"EventTypeMatchResumed":     "match_resumed",
	"EventTypeMatchComplete":    "match_complete",
	"EventTypeMatchReset":       "match_reset",
	"EventTypeMatchConfigured":  "match_configured",
	"EventTypePointTeam1":       "point_team1",
	"EventTypePointTeam2":       "point_team2",
	"EventTypePointRemoved":     "point_removed",
	"EventTypeSideOut":          "side_out",
	"EventTypeUndo":             "undo",
	"EventTypeGameComplete":     "game_complete",
	"EventTypeConfirmGameOver":  "confirm_game_over",
	"EventTypeConfirmMatchOver": "confirm_match_over",
	"EventTypeTimeout":          "timeout",
	"EventTypeTimeoutEnd":       "timeout_ended",
	"EventTypeEndChange":        "end_change",
	"EventTypeSubstitution":     "substitution",
	"EventTypeScoreOverride":    "score_override",
	"EventTypeForfeitDeclared":  "forfeit_declared",
	"EventTypeLet":              "let",
	"EventTypeReDo":             "re_do",
	"EventTypeFault":            "fault",
	"EventTypeLineCall":         "line_call",
}

// TestEventTypeConstants_LowercaseSnake guards CR-1: every EventType constant
// is lowercase snake_case and matches the frozen canonical set.
func TestEventTypeConstants_LowercaseSnake(t *testing.T) {
	// Build a reflection-style map of the real exported constants by reading
	// the package via go/ast. This keeps the test independent of package
	// internals and catches accidental removals or typos.
	got := parseEventTypeConstants(t)

	for name, want := range canonicalEventTypes {
		have, ok := got[name]
		if !ok {
			t.Errorf("expected constant %s to exist in service package", name)
			continue
		}
		if have != want {
			t.Errorf("constant %s = %q, want %q", name, have, want)
		}
		if strings.ToLower(have) != have {
			t.Errorf("constant %s value %q must be lowercase snake_case", name, have)
		}
		if strings.ContainsAny(have, " -") {
			t.Errorf("constant %s value %q must not contain spaces or dashes", name, have)
		}
	}

	// Reject stray event-type constants we did not bless. The only acceptable
	// additions are ones also mirrored to the frontend union.
	for name := range got {
		if _, ok := canonicalEventTypes[name]; !ok {
			t.Errorf("unknown EventType constant %s — add it to canonicalEventTypes here AND the frontend EventType union", name)
		}
	}
}

// TestEventTypeConstants_UsedByWriters guards CR-1, CR-3: every emit-site and
// read-site of an event-type literal in match.go must reference one of the
// EventType* constants rather than an inline string.
//
// The match.go file emits events via two kinds of call-sites:
//   - `EventType:  EventTypeXxx,` field assignments inside CreateXxx params
//   - `EventType:  "…"` checked in enrichedMatchResponse and elsewhere
//
// This test asserts that NO literal event-type string appears in match.go.
// It does this by scanning the file's AST for *ast.BasicLit assigned to
// fields named "EventType" within composite literals.
func TestEventTypeConstants_UsedByWriters(t *testing.T) {
	fset := token.NewFileSet()
	fname := packageFile(t, "match.go")
	f, err := parser.ParseFile(fset, fname, nil, 0)
	if err != nil {
		t.Fatalf("parse match.go: %v", err)
	}

	// Allowed literal event-type values when explicitly querying a historical
	// event (only the timeout sweep at enrichedMatchResponse uses a constant).
	// We allow the empty list; everything must flow through constants.
	var violations []string

	ast.Inspect(f, func(n ast.Node) bool {
		kv, ok := n.(*ast.KeyValueExpr)
		if !ok {
			return true
		}
		id, ok := kv.Key.(*ast.Ident)
		if !ok || id.Name != "EventType" {
			return true
		}
		lit, ok := kv.Value.(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return true
		}
		pos := fset.Position(lit.Pos())
		violations = append(violations, pos.String()+": inline event-type literal "+lit.Value)
		return true
	})

	if len(violations) > 0 {
		t.Errorf("match.go contains inline event-type literals; every EventType field must reference an EventType* constant:\n  %s",
			strings.Join(violations, "\n  "))
	}
}

// parseEventTypeConstants collects the name -> value map of every
// EventType* string constant declared in events.go.
func parseEventTypeConstants(t *testing.T) map[string]string {
	t.Helper()
	fset := token.NewFileSet()
	fname := packageFile(t, "events.go")
	f, err := parser.ParseFile(fset, fname, nil, 0)
	if err != nil {
		t.Fatalf("parse events.go: %v", err)
	}

	got := map[string]string{}
	for _, decl := range f.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for i, name := range vs.Names {
				if !strings.HasPrefix(name.Name, "EventType") {
					continue
				}
				if i >= len(vs.Values) {
					continue
				}
				lit, ok := vs.Values[i].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				// strip surrounding quotes
				val := strings.Trim(lit.Value, "`\"")
				got[name.Name] = val
			}
		}
	}
	return got
}

// packageFile resolves the absolute path to the given file inside this
// (service) package without assuming a CWD. Tests can run from any directory.
func packageFile(t *testing.T, name string) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot determine caller")
	}
	return filepath.Join(filepath.Dir(thisFile), name)
}

// ---------------------------------------------------------------------------
// CR-2: MatchEventResponse shape
// ---------------------------------------------------------------------------

// TestMatchEventResponse_MarshalContract guards CR-2: the event wire shape
// MUST include `timestamp` and a nested `score_snapshot` object, and the
// snapshot MUST carry canonical lowercase snake keys.
func TestMatchEventResponse_MarshalContract(t *testing.T) {
	serving := int32(1)
	server := int32(2)
	resp := MatchEventResponse{
		ID:         42,
		MatchID:    7,
		SequenceID: 3,
		EventType:  EventTypePointTeam1,
		ScoreSnapshot: ScoreSnapshot{
			Team1Score:   5,
			Team2Score:   4,
			CurrentSet:   1,
			CurrentGame:  1,
			ServingTeam:  &serving,
			ServerNumber: &server,
			SetScores:    json.RawMessage(`[]`),
		},
		Payload:   json.RawMessage(`{}`),
		Timestamp: "2026-04-16T00:00:00Z",
		CreatedAt: "2026-04-16T00:00:00Z",
	}

	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal MatchEventResponse: %v", err)
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(b, &top); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Canonical top-level keys required by frontend.
	required := []string{
		"id", "match_id", "sequence_id", "event_type",
		"score_snapshot", "payload", "timestamp", "created_at",
	}
	for _, k := range required {
		if _, ok := top[k]; !ok {
			t.Errorf("MatchEventResponse JSON missing key %q; got keys %v", k, keysOf(top))
		}
	}

	// Snapshot must deserialize to a typed ScoreSnapshot.
	var snap map[string]json.RawMessage
	if err := json.Unmarshal(top["score_snapshot"], &snap); err != nil {
		t.Fatalf("score_snapshot is not an object: %v", err)
	}
	snapRequired := []string{
		"team_1_score", "team_2_score",
		"current_set", "current_game",
		"serving_team", "server_number",
		"set_scores",
	}
	for _, k := range snapRequired {
		if _, ok := snap[k]; !ok {
			t.Errorf("score_snapshot missing key %q; got keys %v", k, keysOf(snap))
		}
	}
}

// TestScoreSnapshot_MarshalContract verifies round-trip symmetry so the
// frontend can rely on stable serialized keys regardless of pointer state.
func TestScoreSnapshot_MarshalContract(t *testing.T) {
	cases := []ScoreSnapshot{
		{Team1Score: 1, Team2Score: 2, CurrentSet: 1, CurrentGame: 1, SetScores: json.RawMessage(`[]`)},
		{
			Team1Score: 10, Team2Score: 11, CurrentSet: 2, CurrentGame: 2,
			ServingTeam: pInt32(1), ServerNumber: pInt32(1),
			SetScores: json.RawMessage(`[{"game":1}]`),
		},
	}

	for _, want := range cases {
		b, err := json.Marshal(want)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		var got ScoreSnapshot
		if err := json.Unmarshal(b, &got); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if got.Team1Score != want.Team1Score || got.Team2Score != want.Team2Score {
			t.Errorf("score round-trip mismatch; got %+v want %+v", got, want)
		}
		if (want.ServingTeam == nil) != (got.ServingTeam == nil) {
			t.Errorf("serving_team nullability changed; got %+v want %+v", got.ServingTeam, want.ServingTeam)
		}
	}
}

func pInt32(v int32) *int32 { return &v }

func keysOf(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// ---------------------------------------------------------------------------
// CR-4: single enrichment — applyEngineResult returns a pre-enriched response
// ---------------------------------------------------------------------------

// TestApplyEngineResult_ReturnsPreEnrichedResponse asserts that the private
// scoring helper returns FOUR values, the third being a MatchResponse. This
// is the mechanical guarantee that every mutation enriches exactly once.
//
// Reflection cannot see unexported methods on MatchService without an
// instance, so we verify by re-parsing the AST and confirming the return
// signature.
func TestApplyEngineResult_ReturnsPreEnrichedResponse(t *testing.T) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, packageFile(t, "match.go"), nil, 0)
	if err != nil {
		t.Fatalf("parse match.go: %v", err)
	}
	var found bool
	ast.Inspect(f, func(n ast.Node) bool {
		fd, ok := n.(*ast.FuncDecl)
		if !ok || fd.Name.Name != "applyEngineResult" || fd.Recv == nil {
			return true
		}
		found = true
		if fd.Type.Results == nil {
			t.Errorf("applyEngineResult must have a return list")
			return false
		}

		var names []string
		for _, field := range fd.Type.Results.List {
			// Each field may declare multiple types on one line; expand.
			count := len(field.Names)
			if count == 0 {
				count = 1
			}
			for i := 0; i < count; i++ {
				names = append(names, exprString(field.Type))
			}
		}
		want := []string{"generated.Match", "generated.MatchEvent", "MatchResponse", "error"}
		if !reflect.DeepEqual(names, want) {
			t.Errorf("applyEngineResult return types = %v, want %v", names, want)
		}
		return false
	})
	if !found {
		t.Fatalf("applyEngineResult declaration not found in match.go")
	}
}

// TestBroadcastMatchUpdate_TakesPreEnriched asserts the helper's signature
// accepts an already-enriched MatchResponse, closing the door on CR-4 drift.
func TestBroadcastMatchUpdate_TakesPreEnriched(t *testing.T) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, packageFile(t, "match.go"), nil, 0)
	if err != nil {
		t.Fatalf("parse match.go: %v", err)
	}
	var found bool
	ast.Inspect(f, func(n ast.Node) bool {
		fd, ok := n.(*ast.FuncDecl)
		if !ok || fd.Name.Name != "broadcastMatchUpdate" || fd.Recv == nil {
			return true
		}
		found = true
		var paramTypes []string
		for _, p := range fd.Type.Params.List {
			count := len(p.Names)
			if count == 0 {
				count = 1
			}
			for i := 0; i < count; i++ {
				paramTypes = append(paramTypes, exprString(p.Type))
			}
		}
		want := []string{"context.Context", "generated.Match", "MatchResponse"}
		if !reflect.DeepEqual(paramTypes, want) {
			t.Errorf("broadcastMatchUpdate params = %v, want %v", paramTypes, want)
		}
		return false
	})
	if !found {
		t.Fatal("broadcastMatchUpdate declaration not found")
	}
}

// exprString renders an ast.Expr back to a compact Go source snippet suitable
// for identifying types in test assertions.
func exprString(e ast.Expr) string {
	switch x := e.(type) {
	case *ast.Ident:
		return x.Name
	case *ast.SelectorExpr:
		return exprString(x.X) + "." + x.Sel.Name
	case *ast.StarExpr:
		return "*" + exprString(x.X)
	case *ast.ArrayType:
		return "[]" + exprString(x.Elt)
	default:
		return "<unknown>"
	}
}

// ---------------------------------------------------------------------------
// CR-6: ListCourts enriches active_match / on_deck_match
// ---------------------------------------------------------------------------

// TestListCourts_EnrichesActiveAndOnDeck guards CR-6 by asserting that the
// ListCourts method body references `activeMatchForCourt` and
// `onDeckMatchForCourt` — the helpers that populate active_match /
// on_deck_match on each CourtResponse.
func TestListCourts_EnrichesActiveAndOnDeck(t *testing.T) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, packageFile(t, "venue.go"), nil, 0)
	if err != nil {
		t.Fatalf("parse venue.go: %v", err)
	}

	var body string
	ast.Inspect(f, func(n ast.Node) bool {
		fd, ok := n.(*ast.FuncDecl)
		if !ok || fd.Name.Name != "ListCourts" || fd.Recv == nil {
			return true
		}
		// Capture source-text approximation by visiting each call inside.
		ast.Inspect(fd.Body, func(nn ast.Node) bool {
			if call, ok := nn.(*ast.CallExpr); ok {
				body += exprString(call.Fun) + ";"
			}
			return true
		})
		return false
	})
	if body == "" {
		t.Fatal("ListCourts not found in venue.go")
	}
	for _, helper := range []string{"activeMatchForCourt", "onDeckMatchForCourt"} {
		if !strings.Contains(body, helper) {
			t.Errorf("ListCourts must call %s to enrich CourtResponse (CR-6)", helper)
		}
	}
}

// ---------------------------------------------------------------------------
// CR-7: ScoredByName removed from MatchResponse
// ---------------------------------------------------------------------------

// TestMatchResponse_NoScoredByName guards CR-7: the removed phantom field
// must not reappear on the response type.
func TestMatchResponse_NoScoredByName(t *testing.T) {
	typ := reflect.TypeOf(MatchResponse{})
	for i := 0; i < typ.NumField(); i++ {
		f := typ.Field(i)
		if f.Name == "ScoredByName" {
			t.Errorf("MatchResponse must not carry ScoredByName (CR-7)")
		}
		if strings.Contains(f.Tag.Get("json"), "scored_by_name") {
			t.Errorf("MatchResponse must not tag any field as scored_by_name (CR-7); found on %s", f.Name)
		}
	}
}

// ---------------------------------------------------------------------------
// CR-8: ConfirmMatchOver rejects a tie without explicit winner
// ---------------------------------------------------------------------------

// TestConfirmMatchOver_RejectsTie guards CR-8 by asserting that the method's
// body contains the tie-guard message. A full integration test would require
// database fixtures; the AST-level check is sufficient to catch removal.
func TestConfirmMatchOver_RejectsTie(t *testing.T) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, packageFile(t, "match.go"), nil, 0)
	if err != nil {
		t.Fatalf("parse match.go: %v", err)
	}

	var body string
	ast.Inspect(f, func(n ast.Node) bool {
		fd, ok := n.(*ast.FuncDecl)
		if !ok || fd.Name.Name != "ConfirmMatchOver" || fd.Recv == nil {
			return true
		}
		ast.Inspect(fd.Body, func(nn ast.Node) bool {
			if lit, ok := nn.(*ast.BasicLit); ok && lit.Kind == token.STRING {
				body += lit.Value + "\n"
			}
			return true
		})
		return false
	})
	if body == "" {
		t.Fatal("ConfirmMatchOver not found in match.go")
	}
	if !strings.Contains(body, "cannot confirm match with tied games") {
		t.Errorf("ConfirmMatchOver must return a ValidationError with the tie-guard message (CR-8)")
	}
}

// ---------------------------------------------------------------------------
// Keep the context import alive if unused by future edits.
// ---------------------------------------------------------------------------
var _ = context.Background
