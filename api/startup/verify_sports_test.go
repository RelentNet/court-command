package startup

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/court-command/court-command/logto"
)

// fakeOrgLister is an in-memory orgLister for unit tests. orgs is the
// list ListOrganizations returns; err, when non-nil, is returned
// instead.
type fakeOrgLister struct {
	orgs []logto.Organization
	err  error
}

func (f *fakeOrgLister) ListOrganizations(_ context.Context) ([]logto.Organization, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.orgs, nil
}

func TestVerifySportsOrgIDs_AllValid_PassesSilently(t *testing.T) {
	t.Parallel()
	sports := []SportRow{
		{Slug: "pickleball", OrgID: "vcx906e38a2v"},
		{Slug: "padel", OrgID: "abc123def456"},
	}
	lister := &fakeOrgLister{orgs: []logto.Organization{
		{ID: "vcx906e38a2v", Name: "Pickleball"},
		{ID: "abc123def456", Name: "Padel"},
		{ID: "extra-org-id", Name: "Some Other Org"}, // unrelated orgs are fine
	}}

	for _, isProd := range []bool{true, false} {
		err := VerifySportsOrgIDs(context.Background(), sports, lister, isProd)
		if err != nil {
			t.Fatalf("isProduction=%v: expected nil, got %v", isProd, err)
		}
	}
}

func TestVerifySportsOrgIDs_PendingSeedPlaceholder_FailsInProd_WarnsInDev(t *testing.T) {
	t.Parallel()
	sports := []SportRow{
		{Slug: "pickleball", OrgID: "pending-seed:pickleball"},
	}
	lister := &fakeOrgLister{orgs: []logto.Organization{
		{ID: "vcx906e38a2v", Name: "Pickleball"},
	}}

	// production: must fail with an actionable message.
	err := VerifySportsOrgIDs(context.Background(), sports, lister, true)
	if err == nil {
		t.Fatal("isProduction=true with pending-seed:pickleball: expected error, got nil")
	}
	msg := err.Error()
	if !strings.Contains(msg, "pickleball") {
		t.Errorf("error should name the sport, got: %s", msg)
	}
	if !strings.Contains(msg, "pending-seed") {
		t.Errorf("error should include the placeholder value, got: %s", msg)
	}
	if !strings.Contains(msg, "auto-bootstrap") {
		t.Errorf("error should reference the auto-bootstrap, got: %s", msg)
	}

	// development: must NOT fail.
	if err := VerifySportsOrgIDs(context.Background(), sports, lister, false); err != nil {
		t.Fatalf("isProduction=false with pending-seed: expected nil, got %v", err)
	}
}

func TestIsPendingSeedPlaceholder(t *testing.T) {
	t.Parallel()
	cases := []struct {
		v    string
		want bool
	}{
		{"pending-seed", true},
		{"pending-seed:pickleball", true},
		{"pending-seed:demo_sport", true},
		{"pending-seed:anything", true},
		{"vcx906e38a2v", false},
		{"", false}, // empty handled separately by the verifier
		{"pending", false},
		{"pending-seedX", false}, // no colon -> not a placeholder
	}
	for _, c := range cases {
		if got := IsPendingSeedPlaceholder(c.v); got != c.want {
			t.Errorf("IsPendingSeedPlaceholder(%q) = %v, want %v", c.v, got, c.want)
		}
	}
}

func TestVerifySportsOrgIDs_EmptyOrgID_TreatedAsPlaceholder(t *testing.T) {
	t.Parallel()
	sports := []SportRow{{Slug: "pickleball", OrgID: ""}}
	lister := &fakeOrgLister{orgs: []logto.Organization{}}

	err := VerifySportsOrgIDs(context.Background(), sports, lister, true)
	if err == nil {
		t.Fatal("expected error for empty orgID in production")
	}
	if !strings.Contains(err.Error(), "placeholder") {
		t.Errorf("empty orgID should be reported as a placeholder, got: %s", err.Error())
	}
}

func TestVerifySportsOrgIDs_StaleID_NotInLogto_FailsInProd(t *testing.T) {
	t.Parallel()
	sports := []SportRow{
		{Slug: "pickleball", OrgID: "ekup1zyrrxj4"}, // the stale 00041 ID
	}
	lister := &fakeOrgLister{orgs: []logto.Organization{
		{ID: "vcx906e38a2v", Name: "Pickleball"}, // real ID is different
	}}

	err := VerifySportsOrgIDs(context.Background(), sports, lister, true)
	if err == nil {
		t.Fatal("expected error for stale orgID in production")
	}
	msg := err.Error()
	if !strings.Contains(msg, "ekup1zyrrxj4") {
		t.Errorf("error should include the stale ID, got: %s", msg)
	}
	if !strings.Contains(msg, "does not exist") {
		t.Errorf("error should explain the org doesn't exist, got: %s", msg)
	}

	// development: warn, don't fail.
	if err := VerifySportsOrgIDs(context.Background(), sports, lister, false); err != nil {
		t.Fatalf("isProduction=false with stale ID: expected nil, got %v", err)
	}
}

func TestVerifySportsOrgIDs_MultipleProblems_AllReportedInOneError(t *testing.T) {
	t.Parallel()
	sports := []SportRow{
		{Slug: "pickleball", OrgID: "pending-seed:pickleball"},
		{Slug: "padel", OrgID: "stale-id-xyz"},
		{Slug: "tennis", OrgID: "real-org-id"}, // good
	}
	lister := &fakeOrgLister{orgs: []logto.Organization{
		{ID: "real-org-id", Name: "Tennis"},
	}}

	err := VerifySportsOrgIDs(context.Background(), sports, lister, true)
	if err == nil {
		t.Fatal("expected error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "pickleball") || !strings.Contains(msg, "padel") {
		t.Errorf("both problem sports should be reported in one error, got: %s", msg)
	}
	if strings.Contains(msg, "tennis") {
		t.Errorf("the good sport should not appear in the error, got: %s", msg)
	}
}

func TestVerifySportsOrgIDs_NilLogtoClient_NoOp(t *testing.T) {
	t.Parallel()
	// Even with bad data, nil client means we can't verify -- match
	// main.go's existing dev-mode "Logto disabled" pattern.
	sports := []SportRow{{Slug: "pickleball", OrgID: "pending-seed:pickleball"}}
	if err := VerifySportsOrgIDs(context.Background(), sports, nil, true); err != nil {
		t.Fatalf("nil client should be a no-op even in production, got %v", err)
	}
}

func TestVerifySportsOrgIDs_NoActiveSports_NoOp(t *testing.T) {
	t.Parallel()
	// Brand-new install before migrations / tests using an empty DB.
	lister := &fakeOrgLister{orgs: []logto.Organization{
		{ID: "vcx906e38a2v"},
	}}
	if err := VerifySportsOrgIDs(context.Background(), nil, lister, true); err != nil {
		t.Fatalf("empty sports slice should be a no-op, got %v", err)
	}
}

func TestVerifySportsOrgIDs_LogtoAPIError_PropagatedAsError(t *testing.T) {
	t.Parallel()
	// If the Management API itself is unreachable, we can't
	// distinguish a real config problem from a transient network
	// blip -- surface it as an error so the operator decides. main.go
	// wraps this with context.
	sports := []SportRow{{Slug: "pickleball", OrgID: "vcx906e38a2v"}}
	lister := &fakeOrgLister{err: errors.New("logto management API down")}

	for _, isProd := range []bool{true, false} {
		err := VerifySportsOrgIDs(context.Background(), sports, lister, isProd)
		if err == nil {
			t.Fatalf("isProduction=%v: expected Logto API error to propagate", isProd)
		}
		if !strings.Contains(err.Error(), "logto management API down") {
			t.Errorf("expected wrapped underlying error, got: %s", err.Error())
		}
	}
}
