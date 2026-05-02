// api/handler/sports_test.go
package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/court-command/court-command/testutil"
)

// sportRow mirrors service.SportDTO for decoding without importing the
// service package (avoids tight coupling in the handler test).
type sportRow struct {
	ID         int64  `json:"id"`
	Slug       string `json:"slug"`
	Name       string `json:"name"`
	LogtoOrgID string `json:"logto_org_id"`
}

// TestListSports_ReturnsSeededSports verifies that the public
// /api/v1/sports endpoint returns the active sports seeded by migration
// 00041 (pickleball + demo). It also confirms no auth is required.
func TestListSports_ReturnsSeededSports(t *testing.T) {
	pool := testutil.TestDB(t)
	ts := testutil.TestServer(t, pool)
	defer ts.Close()

	// No auth header / cookie — endpoint is public.
	resp, err := http.Get(ts.URL + "/api/v1/sports")
	if err != nil {
		t.Fatalf("GET /api/v1/sports: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var got []sportRow
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// Migration seeds at least pickleball; demo may or may not exist
	// depending on environment. Be flexible but assert at least one row
	// and that pickleball is present with a non-empty logto_org_id.
	if len(got) == 0 {
		t.Fatalf("expected at least one sport, got 0")
	}

	var foundPickleball bool
	for _, s := range got {
		if s.Slug == "" {
			t.Errorf("sport with id=%d has empty slug", s.ID)
		}
		if s.Name == "" {
			t.Errorf("sport %q has empty name", s.Slug)
		}
		if s.LogtoOrgID == "" {
			t.Errorf("sport %q has empty logto_org_id (frontend needs this for org-scoped tokens)", s.Slug)
		}
		if s.Slug == "pickleball" {
			foundPickleball = true
		}
	}
	if !foundPickleball {
		t.Errorf("expected pickleball in seeded sports, got %+v", got)
	}
}

// TestListSports_OmitsInactiveSports verifies that sports with
// is_active=false are filtered out by the underlying ListSports query.
func TestListSports_OmitsInactiveSports(t *testing.T) {
	pool := testutil.TestDB(t)

	// Insert an inactive test sport. Use ON CONFLICT to remain idempotent
	// across reruns of this test against the same DB.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO sports (slug, name, logto_org_id, is_active, sort_order)
		 VALUES ('handler-test-inactive', 'Handler Test Inactive', 'org_handler_inactive', false, 999)
		 ON CONFLICT (slug) DO UPDATE SET is_active = false`)
	if err != nil {
		t.Fatalf("seed inactive sport: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM sports WHERE slug = 'handler-test-inactive'`)
	})

	ts := testutil.TestServer(t, pool)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/v1/sports")
	if err != nil {
		t.Fatalf("GET /api/v1/sports: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var got []sportRow
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	for _, s := range got {
		if s.Slug == "handler-test-inactive" {
			t.Errorf("inactive sport leaked into response: %+v", s)
		}
	}
}
