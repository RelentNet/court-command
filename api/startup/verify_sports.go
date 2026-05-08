// Package startup contains one-shot validation routines that run after
// dependencies are constructed but before the HTTP server begins
// accepting traffic. They exist to convert silent misconfiguration into
// loud, actionable boot failures.
package startup

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/court-command/court-command/logto"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PendingSeedPrefix is the prefix migration 00042 writes into
// sports.logto_org_id whenever it sees a row still holding the stale
// hardcoded values from migration 00041 (e.g. 'pending-seed:pickleball').
// The per-slug suffix is required because of the UNIQUE constraint on
// the column. The api's auto-bootstrap (logtoseed.Run, called from
// api/main.go) replaces these with the real Logto org IDs on the next
// boot.
const PendingSeedPrefix = "pending-seed"

// IsPendingSeedPlaceholder reports whether v is the placeholder value
// (or any 'pending-seed:*' variant) that means "this row hasn't been
// seeded against the real Logto tenant yet."
func IsPendingSeedPlaceholder(v string) bool {
	return v == PendingSeedPrefix || strings.HasPrefix(v, PendingSeedPrefix+":")
}

// orgLister is the narrow subset of *logto.Client that
// VerifySportsOrgIDs depends on. Defining it here keeps the verifier
// trivial to test with a fake -- callers in production pass the real
// *logto.Client, tests pass an in-memory implementation.
type orgLister interface {
	ListOrganizations(ctx context.Context) ([]logto.Organization, error)
}

// SportRow is the minimal projection of the sports table the verifier
// reads. Exported so callers (production: queries against pgxpool;
// tests: literal slices) can build it directly.
type SportRow struct {
	Slug  string
	OrgID string
}

// LoadActiveSportsFromDB reads (slug, logto_org_id) for every active
// sport from the application database. Pulled out of VerifySportsOrgIDs
// so the verifier itself has no concrete pgx dependency and can be
// unit-tested without a database.
func LoadActiveSportsFromDB(ctx context.Context, pool *pgxpool.Pool) ([]SportRow, error) {
	rows, err := pool.Query(ctx,
		`SELECT slug, logto_org_id FROM sports WHERE is_active = true ORDER BY sort_order`)
	if err != nil {
		return nil, fmt.Errorf("query sports: %w", err)
	}
	defer rows.Close()

	var sports []SportRow
	for rows.Next() {
		var s SportRow
		if err := rows.Scan(&s.Slug, &s.OrgID); err != nil {
			return nil, fmt.Errorf("scan sport row: %w", err)
		}
		sports = append(sports, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sport rows: %w", err)
	}
	return sports, nil
}

// VerifySportsOrgIDs ensures every active sport's logto_org_id resolves
// to a real organization on the configured Logto tenant.
//
// Why this exists: Logto generates random org IDs at creation time, so
// the IDs hardcoded in early migrations are stale on every fresh tenant.
// When the SPA requests an org-scoped token via
// getAccessToken(resource, sport.logto_org_id) and the org doesn't
// exist, Logto silently issues a resource-only token instead of
// failing. The api's claims.ElevatedRole() then sees no
// organization_roles claim and never elevates the user to
// platform_admin -- the admin sidebar link disappears, with no error
// surfaced anywhere. This verifier turns that silent downgrade into a
// loud boot-time failure.
//
// Behavior:
//   - In production (cfg.IsProduction == true) any problem is returned
//     as a non-nil error. main.go logs and exits.
//   - In development each problem is logged at WARN level and the
//     function returns nil so local stacks can come up partially
//     configured.
//
// The function is a no-op when logtoClient is nil (the existing pattern
// in main.go for environments without Logto Management API creds).
//
// Production callers should use VerifySportsOrgIDsFromDB, which handles
// the database read and forwards to this function. This signature takes
// pre-loaded rows so unit tests can exercise the verification logic
// without a Postgres connection.
func VerifySportsOrgIDs(
	ctx context.Context,
	sports []SportRow,
	logtoClient orgLister,
	isProduction bool,
) error {
	if logtoClient == nil {
		// Matches main.go's existing behavior when Management API env
		// vars aren't set: the verifier silently no-ops because
		// without a Logto client there's nothing to verify against.
		// main.go has already logged a warning at the construction
		// site, so we don't double-log here.
		return nil
	}
	if len(sports) == 0 {
		// No active sports yet -- happens on a brand-new install before
		// migrations have populated the table, or in tests. Nothing
		// to verify; not an error.
		return nil
	}

	// One Logto API call covers every sport. ListOrganizations is
	// paginated to 100 in the client today; if Court Command ever
	// supports >100 sports this will need pagination, but the fail
	// mode (a real org missing from the page) would be visible here.
	orgs, err := logtoClient.ListOrganizations(ctx)
	if err != nil {
		return fmt.Errorf("verify sports org IDs: list logto orgs: %w", err)
	}
	known := make(map[string]struct{}, len(orgs))
	for _, o := range orgs {
		known[o.ID] = struct{}{}
	}

	var problems []string
	for _, s := range sports {
		switch {
		case s.OrgID == "" || IsPendingSeedPlaceholder(s.OrgID):
			problems = append(problems, fmt.Sprintf(
				"sport %q has placeholder logto_org_id=%q -- the api auto-bootstrap (logtoseed.Run) should have replaced this; check earlier boot logs for a logto seed failure",
				s.Slug, s.OrgID))
		default:
			if _, ok := known[s.OrgID]; !ok {
				problems = append(problems, fmt.Sprintf(
					"sport %q references logto_org_id=%q which does not exist on the Logto tenant -- the org may have been recreated; the api auto-bootstrap should re-sync on the next clean boot, or update the row to match Logto Console",
					s.Slug, s.OrgID))
			}
		}
	}

	if len(problems) == 0 {
		slog.Info("verified sports.logto_org_id against Logto tenant",
			"sports_checked", len(sports),
			"logto_orgs_listed", len(orgs))
		return nil
	}

	if isProduction {
		// Concatenate all problems into one error so the operator sees
		// every issue in a single boot-failure message rather than
		// fix-one-find-another.
		return errors.New("sports.logto_org_id verification failed:\n  - " +
			strings.Join(problems, "\n  - "))
	}

	for _, p := range problems {
		slog.Warn("sports.logto_org_id verification problem (dev mode -- not failing boot)",
			"problem", p)
	}
	return nil
}

// VerifySportsOrgIDsFromDB is the production entry point: loads active
// sports from the application database and runs VerifySportsOrgIDs
// against them. Returns nil immediately when logtoClient is nil so
// callers don't need to gate the call themselves.
func VerifySportsOrgIDsFromDB(
	ctx context.Context,
	pool *pgxpool.Pool,
	logtoClient orgLister,
	isProduction bool,
) error {
	if logtoClient == nil {
		return nil
	}
	sports, err := LoadActiveSportsFromDB(ctx, pool)
	if err != nil {
		return fmt.Errorf("verify sports org IDs: %w", err)
	}
	return VerifySportsOrgIDs(ctx, sports, logtoClient, isProduction)
}
