package logtoseed

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/court-command/court-command/logto"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Logto-side names. Exported so the api startup verifier and the CLI's
// summary printer can reference the same identifiers.
const (
	SPAAppName            = "Court Command Web"
	M2MAppName            = "Court Command Backend"
	APIResourceName       = "Court Command API"
	MgmtAPIRoleName       = "Logto Management API access"
	PickleballOrgName     = "Pickleball"
	DemoSportOrgName      = "Demo Sport"
	pickleballOrgDesc     = "Production sport on Court Command"
	demoSportOrgDesc      = "Test organization that exercises the multi-sport plumbing"
	courtCommandHookName  = "Court Command Backend"
	platformAdminRoleName = "platform_admin"

	// apiUserRoleName is a Logto User-type role bound to all 12 API
	// resource scopes. Granted to the bootstrap admin so their access
	// tokens carry write:profile, manage_*, etc. Without it, the SPA
	// will receive a token with NO API scopes and every PATCH/POST
	// will 403 even though the user is "platform_admin" in their org.
	apiUserRoleName = "Court Command API (all scopes)"

	// advisoryLockKey is the 64-bit constant used for a transaction-
	// scoped Postgres advisory lock around Run. When >1 api container
	// boots concurrently against the same DB, only one runs the seeder
	// at a time; the others wait, then re-run (cheap because every step
	// is idempotent and finds existing items).
	//
	// Picked arbitrarily; the value just has to be stable. Encoded as
	// the integer for "logtoseed" (a hash of the package name).
	advisoryLockKey int64 = 0x6c6f67746f73642a // "logtosd*"
)

// apiScopes are the 12 Court Command API scopes registered on the API
// resource. Order is intentional: read before write within each domain.
var apiScopes = []scopeDef{
	{"read:profile", "Read user profile data"},
	{"write:profile", "Update user profile data"},
	{"read:tournaments", "Read tournament data"},
	{"write:tournaments", "Create or update tournaments"},
	{"read:matches", "Read match data"},
	{"write:matches", "Create or update matches and scores"},
	{"read:registrations", "Read registration data"},
	{"write:registrations", "Create or update registrations"},
	{"read:overlay", "Read overlay configuration"},
	{"write:overlay", "Update overlay configuration"},
	{"read:admin", "Read admin-level data"},
	{"write:admin", "Perform admin-level actions"},
}

// orgScopes are the five organization-level scopes shared across roles.
var orgScopes = []scopeDef{
	{"manage_tournaments", "Create, update, archive tournaments in this sport"},
	{"manage_matches", "Score, edit, override matches in this sport"},
	{"manage_registrations", "Add, approve, withdraw registrations"},
	{"manage_users", "Manage user roles and statuses within this sport"},
	{"read_all", "Read all sport data (no write)"},
}

// orgRoles are the five organization roles defined on the template,
// with their scope assignments.
var orgRoles = []orgRoleDef{
	{Name: "player", Description: "Default role for users in this sport",
		Scopes: []string{"read_all"}},
	{Name: "tournament_director", Description: "Can manage tournaments in this sport",
		Scopes: []string{"read_all", "manage_tournaments", "manage_registrations"}},
	{Name: "referee", Description: "Can score matches in this sport",
		Scopes: []string{"read_all", "manage_matches"}},
	{Name: "scorekeeper", Description: "Same as referee, alternate label for staff naming",
		Scopes: []string{"read_all", "manage_matches"}},
	{Name: "platform_admin", Description: "Full platform access within this sport",
		Scopes: []string{"read_all", "manage_tournaments", "manage_matches", "manage_registrations", "manage_users"}},
}

// hookEvents are the webhook events the backend's webhook handler subscribes to.
var hookEvents = []string{"User.Created", "User.Data.Updated", "User.Deleted"}

type scopeDef struct {
	name, description string
}

type orgRoleDef struct {
	Name        string
	Description string
	Scopes      []string
}

// Result is what Run produces -- the IDs of the things that were found
// or created. The CLI prints these for the operator; the api just logs
// summary counts. Returned even on error so the caller can see partial
// state.
type Result struct {
	APIResourceID     string
	SPAAppID          string
	OrgScopeIDs       map[string]string // scope name -> ID
	OrgRoleIDs        map[string]string // role name -> ID
	PickleballOrgID   string
	DemoSportOrgID    string
	BootstrapUserID   string
	APIUserRoleID     string
	WebhookSigningKey string

	// SPAAppCreated and WebhookCreated are true when this Run created a
	// new resource (versus adopting an existing one). The CLI uses
	// these to decide which env values to emphasize in its summary; the
	// api uses them to log a loud warning in production because a newly
	// created SPA app or webhook means the baked-in VITE_LOGTO_APP_ID /
	// LOGTO_WEBHOOK_SIGNING_KEY env values are now stale.
	SPAAppCreated   bool
	WebhookCreated  bool
}

// Run idempotently provisions the Logto tenant and syncs sports.logto_org_id
// in the application DB. Steps:
//
//  1. Sanity-check Management API auth.
//  2. Acquire a Postgres transaction-scoped advisory lock (when pool != nil).
//     Prevents concurrent api containers from racing each other on the
//     find-or-create steps.
//  3. API resource + scopes.
//  4. SPA app (drift-protected: if cfg.ExpectedSPAAppID is set, the existing
//     app must match that ID; refuses to silently create a new one).
//  5. M2M role assignment.
//  6. Org scopes + org roles.
//  7. Pickleball + (optionally) Demo Sport orgs.
//  8. Bootstrap admin: find-or-create user, ensure platform_admin in every
//     sport org.
//  9. API User-type role bound to all 12 API scopes, granted to admin.
//  10. Email connector + sign-in experience.
//  11. Webhook (drift-protected: if cfg.ExpectedWebhookSigningKey is set, the
//      existing hook's signing key must match; refuses to silently mint a new key).
//  12. Sync sports.logto_org_id (when pool != nil).
//
// Caller is responsible for constructing the *logto.Client and *pgxpool.Pool.
// Pass pool == nil when running without an application database (the CLI
// against a fresh Logto without DATABASE_URL).
func Run(ctx context.Context, cfg *Config, client *logto.Client, pool *pgxpool.Pool) (*Result, error) {
	if cfg == nil {
		return nil, errors.New("logtoseed.Run: cfg is nil")
	}
	if client == nil {
		return nil, errors.New("logtoseed.Run: client is nil")
	}
	r := &Result{}

	slog.Info("logto seed starting",
		"endpoint", cfg.Endpoint,
		"m2m_app_id", cfg.MgmtAppID,
		"seed_demo_sport", cfg.SeedDemoSport,
		"smtp_configured", cfg.SMTPConfigured(),
		"db_sync_enabled", pool != nil,
	)

	if _, err := client.GetManagementToken(ctx); err != nil {
		return r, fmt.Errorf("management API token request failed (check LOGTO_MANAGEMENT_API_APP_ID/SECRET): %w", err)
	}

	// Acquire the advisory lock if we have a DB pool. pg_advisory_xact_lock
	// is held until the transaction ends; we run everything inside one
	// transaction so the lock release is automatic. If the lock isn't
	// available because another container is mid-Run, this BLOCKS until
	// it gets released -- correct behavior since both containers want
	// the same end state.
	if pool != nil {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			return r, fmt.Errorf("acquire DB connection for advisory lock: %w", err)
		}
		defer conn.Release()
		tx, err := conn.Begin(ctx)
		if err != nil {
			return r, fmt.Errorf("begin advisory-lock tx: %w", err)
		}
		defer func() { _ = tx.Rollback(ctx) }() // commit at end; rollback is harmless after commit

		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", advisoryLockKey); err != nil {
			return r, fmt.Errorf("acquire advisory lock: %w", err)
		}

		if err := runStepsLocked(ctx, cfg, client, tx, r); err != nil {
			return r, err
		}

		if err := tx.Commit(ctx); err != nil {
			return r, fmt.Errorf("commit advisory-lock tx: %w", err)
		}
	} else {
		// CLI-without-DATABASE_URL path: no lock, no DB sync. The
		// runStepsLocked function tolerates a nil tx by skipping
		// syncSportsOrgIDs.
		if err := runStepsLocked(ctx, cfg, client, nil, r); err != nil {
			return r, err
		}
	}

	// Drift warnings: emitted AFTER successful Run so they don't get
	// lost in error noise. These are how the operator learns that
	// baked-in env values went stale.
	if r.SPAAppCreated && cfg.ExpectedSPAAppID == "" {
		slog.Warn("logto seed: created NEW SPA app -- bake VITE_LOGTO_APP_ID into the web build",
			"new_app_id", r.SPAAppID)
	}
	if r.WebhookCreated && cfg.ExpectedWebhookSigningKey == "" {
		slog.Warn("logto seed: created NEW webhook -- update LOGTO_WEBHOOK_SIGNING_KEY in api env",
			"new_signing_key", r.WebhookSigningKey)
	}

	slog.Info("logto seed complete",
		"pickleball_org_id", r.PickleballOrgID,
		"demo_sport_org_id", r.DemoSportOrgID,
		"spa_app_id", r.SPAAppID,
		"bootstrap_user_id", r.BootstrapUserID,
	)
	return r, nil
}

func runStepsLocked(ctx context.Context, cfg *Config, c *logto.Client, tx pgx.Tx, r *Result) error {
	if err := seedAPIResource(ctx, c, cfg, r); err != nil {
		return fmt.Errorf("API resource: %w", err)
	}
	if err := seedSPAApp(ctx, c, cfg, r); err != nil {
		return fmt.Errorf("SPA app: %w", err)
	}
	if err := assignManagementAPIRole(ctx, c, cfg); err != nil {
		return fmt.Errorf("M2M role assignment: %w", err)
	}
	if err := seedOrgScopes(ctx, c, r); err != nil {
		return fmt.Errorf("org scopes: %w", err)
	}
	if err := seedOrgRoles(ctx, c, r); err != nil {
		return fmt.Errorf("org roles: %w", err)
	}
	if err := seedOrganizations(ctx, c, cfg, r); err != nil {
		return fmt.Errorf("organizations: %w", err)
	}
	if err := seedBootstrapAdmin(ctx, c, cfg, r); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	if err := seedAPIUserRole(ctx, c, r); err != nil {
		return fmt.Errorf("API user role: %w", err)
	}
	if err := seedEmailConnector(ctx, c, cfg); err != nil {
		return fmt.Errorf("email connector: %w", err)
	}
	if err := seedSignInExperience(ctx, c, cfg); err != nil {
		return fmt.Errorf("sign-in experience: %w", err)
	}
	if err := seedWebhook(ctx, c, cfg, r); err != nil {
		return fmt.Errorf("webhook: %w", err)
	}
	if tx != nil {
		if err := syncSportsOrgIDs(ctx, tx, cfg, r); err != nil {
			return fmt.Errorf("sync sports.logto_org_id: %w", err)
		}
	}
	return nil
}

func seedAPIResource(ctx context.Context, c *logto.Client, cfg *Config, r *Result) error {
	existing, err := c.FindResourceByIndicator(ctx, cfg.APIResourceIndicator)
	if err != nil {
		return err
	}
	var resID string
	if existing != nil {
		slog.Info("api resource exists", "indicator", cfg.APIResourceIndicator, "id", existing.ID)
		resID = existing.ID
	} else {
		created, err := c.CreateResource(ctx, logto.CreateResourceParams{
			Name:      APIResourceName,
			Indicator: cfg.APIResourceIndicator,
		})
		if err != nil {
			return fmt.Errorf("create resource: %w", err)
		}
		slog.Info("created api resource", "indicator", cfg.APIResourceIndicator, "id", created.ID)
		resID = created.ID
	}
	r.APIResourceID = resID

	have, err := c.ListResourceScopes(ctx, resID)
	if err != nil {
		return fmt.Errorf("list scopes: %w", err)
	}
	haveSet := make(map[string]bool, len(have))
	for _, s := range have {
		haveSet[s.Name] = true
	}
	added := 0
	for _, s := range apiScopes {
		if haveSet[s.name] {
			continue
		}
		if _, err := c.CreateResourceScope(ctx, resID, s.name, s.description); err != nil {
			return fmt.Errorf("create scope %q: %w", s.name, err)
		}
		added++
	}
	slog.Info("api scopes synced", "existing", len(have), "added", added, "target", len(apiScopes))
	return nil
}

func seedSPAApp(ctx context.Context, c *logto.Client, cfg *Config, r *Result) error {
	existing, err := c.FindApplicationByName(ctx, SPAAppName)
	if err != nil {
		return err
	}
	if existing != nil {
		// Drift protection: when the operator pinned the expected ID
		// (LOGTO_SPA_APP_ID env), refuse to keep going if the existing
		// app has a DIFFERENT ID. That would mean someone deleted the
		// original and created a new one, which silently breaks the
		// web build that bakes in VITE_LOGTO_APP_ID.
		if cfg.ExpectedSPAAppID != "" && existing.ID != cfg.ExpectedSPAAppID {
			return fmt.Errorf(
				"SPA app %q has id=%q but LOGTO_SPA_APP_ID env expects %q -- the SPA app appears to have been recreated; either restore the original id, or unset LOGTO_SPA_APP_ID and rebuild the web image with the new id baked in as VITE_LOGTO_APP_ID",
				SPAAppName, existing.ID, cfg.ExpectedSPAAppID)
		}
		slog.Info("spa app exists", "name", SPAAppName, "id", existing.ID)
		r.SPAAppID = existing.ID
		return nil
	}

	// No existing app. If the operator pinned an expected ID this is a
	// hard error -- they're trusting an ID that doesn't exist on the
	// tenant. We don't auto-create because that would issue a fresh ID
	// and silently invalidate every SPA that was built against the
	// expected one.
	if cfg.ExpectedSPAAppID != "" {
		return fmt.Errorf(
			"SPA app %q not found and LOGTO_SPA_APP_ID=%q is set -- the app appears to have been deleted; either restore it in Logto Console with that exact id, or unset LOGTO_SPA_APP_ID to allow the seeder to create a fresh one (this requires rebuilding the web image)",
			SPAAppName, cfg.ExpectedSPAAppID)
	}

	created, err := c.CreateApplication(ctx, logto.CreateApplicationParams{
		Name:        SPAAppName,
		Type:        logto.AppTypeSPA,
		Description: "Court Command web frontend (React SPA)",
		OIDCClientMetadata: map[string]interface{}{
			"redirectUris":           []string{cfg.SPARedirectURI},
			"postLogoutRedirectUris": []string{trimAuthCallback(cfg.SPARedirectURI)},
		},
	})
	if err != nil {
		return fmt.Errorf("create SPA app: %w", err)
	}
	slog.Info("created spa app", "name", SPAAppName, "id", created.ID)
	r.SPAAppID = created.ID
	r.SPAAppCreated = true
	return nil
}

// trimAuthCallback derives the post-logout redirect URI from the
// callback URI by trimming the trailing /auth/callback. Pulled out so
// the operation has a name.
func trimAuthCallback(s string) string {
	const suffix = "/auth/callback"
	if len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix {
		return s[:len(s)-len(suffix)]
	}
	return s
}

func assignManagementAPIRole(ctx context.Context, c *logto.Client, cfg *Config) error {
	roles, err := c.ListRoles(ctx)
	if err != nil {
		return fmt.Errorf("list roles: %w", err)
	}
	var mgmtRoleID string
	for _, role := range roles {
		if role.Name == MgmtAPIRoleName {
			mgmtRoleID = role.ID
			break
		}
	}
	if mgmtRoleID == "" {
		return fmt.Errorf("built-in role %q not found in Logto -- cannot self-bootstrap M2M role assignment", MgmtAPIRoleName)
	}
	err = c.AssignApplicationRoles(ctx, cfg.MgmtAppID, []string{mgmtRoleID})
	if err != nil {
		var apiErr *logto.APIError
		if errors.As(err, &apiErr) && apiErr.Status == 422 {
			slog.Info("m2m app already has mgmt api role")
			return nil
		}
		return fmt.Errorf("assign role: %w", err)
	}
	slog.Info("assigned mgmt api role to m2m app")
	return nil
}

func seedOrgScopes(ctx context.Context, c *logto.Client, r *Result) error {
	have, err := c.ListOrganizationScopes(ctx)
	if err != nil {
		return fmt.Errorf("list org scopes: %w", err)
	}
	r.OrgScopeIDs = make(map[string]string, len(have)+len(orgScopes))
	for _, s := range have {
		r.OrgScopeIDs[s.Name] = s.ID
	}
	added := 0
	for _, def := range orgScopes {
		if _, ok := r.OrgScopeIDs[def.name]; ok {
			continue
		}
		created, err := c.CreateOrganizationScope(ctx, def.name, def.description)
		if err != nil {
			return fmt.Errorf("create org scope %q: %w", def.name, err)
		}
		r.OrgScopeIDs[def.name] = created.ID
		added++
	}
	slog.Info("org scopes synced", "existing", len(have), "added", added)
	return nil
}

func seedOrgRoles(ctx context.Context, c *logto.Client, r *Result) error {
	have, err := c.ListOrganizationRoles(ctx)
	if err != nil {
		return fmt.Errorf("list org roles: %w", err)
	}
	r.OrgRoleIDs = make(map[string]string, len(have)+len(orgRoles))
	for _, role := range have {
		r.OrgRoleIDs[role.Name] = role.ID
	}

	added := 0
	for _, def := range orgRoles {
		roleID, ok := r.OrgRoleIDs[def.Name]
		if !ok {
			created, err := c.CreateOrganizationRole(ctx, def.Name, def.Description)
			if err != nil {
				return fmt.Errorf("create org role %q: %w", def.Name, err)
			}
			roleID = created.ID
			r.OrgRoleIDs[def.Name] = roleID
			added++
		}
		currentScopes, err := c.ListOrgRoleScopes(ctx, roleID)
		if err != nil {
			return fmt.Errorf("list scopes for role %q: %w", def.Name, err)
		}
		currentSet := make(map[string]bool, len(currentScopes))
		for _, s := range currentScopes {
			currentSet[s.Name] = true
		}
		var toAdd []string
		for _, scopeName := range def.Scopes {
			if currentSet[scopeName] {
				continue
			}
			scopeID, ok := r.OrgScopeIDs[scopeName]
			if !ok {
				return fmt.Errorf("role %q wants unknown scope %q", def.Name, scopeName)
			}
			toAdd = append(toAdd, scopeID)
		}
		if len(toAdd) > 0 {
			if err := c.AssignScopesToOrgRole(ctx, roleID, toAdd); err != nil {
				return fmt.Errorf("assign scopes to role %q: %w", def.Name, err)
			}
		}
	}
	slog.Info("org roles synced", "existing", len(have), "added", added)
	return nil
}

func seedOrganizations(ctx context.Context, c *logto.Client, cfg *Config, r *Result) error {
	specs := []struct {
		name, desc string
		idField    *string
	}{
		{PickleballOrgName, pickleballOrgDesc, &r.PickleballOrgID},
	}
	if cfg.SeedDemoSport {
		specs = append(specs, struct {
			name, desc string
			idField    *string
		}{DemoSportOrgName, demoSportOrgDesc, &r.DemoSportOrgID})
	} else {
		// Adopt an existing Demo Sport org (so DB sync can update its
		// row) without creating one.
		existing, err := c.FindOrgByName(ctx, DemoSportOrgName)
		if err == nil && existing != nil {
			slog.Info("demo sport org adopted from prior seed", "id", existing.ID)
			r.DemoSportOrgID = existing.ID
		}
	}
	for _, spec := range specs {
		existing, err := c.FindOrgByName(ctx, spec.name)
		if err != nil {
			return fmt.Errorf("find org %q: %w", spec.name, err)
		}
		if existing != nil {
			slog.Info("org exists", "name", spec.name, "id", existing.ID)
			*spec.idField = existing.ID
			continue
		}
		created, err := c.CreateOrganization(ctx, spec.name, spec.desc)
		if err != nil {
			return fmt.Errorf("create org %q: %w", spec.name, err)
		}
		slog.Info("created org", "name", spec.name, "id", created.ID)
		*spec.idField = created.ID
	}
	return nil
}

func seedBootstrapAdmin(ctx context.Context, c *logto.Client, cfg *Config, r *Result) error {
	user, err := c.FindUserByEmail(ctx, cfg.BootstrapEmail)
	if err != nil {
		return fmt.Errorf("find user: %w", err)
	}
	if user != nil {
		slog.Info("bootstrap admin exists", "email", cfg.BootstrapEmail, "id", user.ID)
		r.BootstrapUserID = user.ID
	} else {
		created, err := c.CreateUser(ctx, logto.CreateUserParams{
			PrimaryEmail: cfg.BootstrapEmail,
			Password:     cfg.BootstrapPassword,
			Name:         cfg.BootstrapName,
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		slog.Info("created bootstrap admin", "email", cfg.BootstrapEmail, "id", created.ID)
		r.BootstrapUserID = created.ID
	}

	platformAdminRoleID, ok := r.OrgRoleIDs[platformAdminRoleName]
	if !ok {
		return fmt.Errorf("internal error: %q role ID not resolved", platformAdminRoleName)
	}

	var orgIDs []string
	if r.PickleballOrgID != "" {
		orgIDs = append(orgIDs, r.PickleballOrgID)
	}
	if r.DemoSportOrgID != "" {
		orgIDs = append(orgIDs, r.DemoSportOrgID)
	}
	for _, orgID := range orgIDs {
		if err := c.AddUserToOrganization(ctx, orgID, r.BootstrapUserID); err != nil {
			var apiErr *logto.APIError
			if !(errors.As(err, &apiErr) && apiErr.Status == 422) {
				return fmt.Errorf("add user to org %s: %w", orgID, err)
			}
		}
		if err := c.AssignOrganizationRolesToUser(ctx, orgID, r.BootstrapUserID, []string{platformAdminRoleID}); err != nil {
			var apiErr *logto.APIError
			if !(errors.As(err, &apiErr) && apiErr.Status == 422) {
				return fmt.Errorf("assign role in org %s: %w", orgID, err)
			}
		}
	}
	slog.Info("bootstrap admin platform_admin assignments", "org_count", len(orgIDs))
	return nil
}

func seedWebhook(ctx context.Context, c *logto.Client, cfg *Config, r *Result) error {
	existing, err := c.FindHookByName(ctx, courtCommandHookName)
	if err != nil {
		return fmt.Errorf("find hook: %w", err)
	}
	if existing != nil {
		// Drift protection: if the operator pinned the expected signing
		// key (LOGTO_WEBHOOK_SIGNING_KEY env), refuse to keep going if
		// the existing webhook has a DIFFERENT key. That would mean
		// someone recreated the webhook, which silently breaks api
		// HMAC verification.
		if cfg.ExpectedWebhookSigningKey != "" && existing.SigningKey != cfg.ExpectedWebhookSigningKey {
			return fmt.Errorf(
				"webhook %q has signingKey != LOGTO_WEBHOOK_SIGNING_KEY -- the webhook appears to have been recreated; either restore the original signing key, or update LOGTO_WEBHOOK_SIGNING_KEY env to the new value (%s) and redeploy",
				courtCommandHookName, existing.SigningKey)
		}
		slog.Info("webhook exists", "name", courtCommandHookName, "id", existing.ID)
		r.WebhookSigningKey = existing.SigningKey
		return nil
	}

	if cfg.ExpectedWebhookSigningKey != "" {
		return fmt.Errorf(
			"webhook %q not found and LOGTO_WEBHOOK_SIGNING_KEY is set -- the webhook appears to have been deleted; either restore it in Logto Console with the existing signing key, or unset LOGTO_WEBHOOK_SIGNING_KEY to allow the seeder to create a fresh one (this requires updating the env to the new key after Run logs it)",
			courtCommandHookName)
	}

	created, err := c.CreateHook(ctx, logto.CreateHookParams{
		Name:    courtCommandHookName,
		Events:  hookEvents,
		Config:  map[string]interface{}{"url": cfg.WebhookURL},
		Enabled: true,
	})
	if err != nil {
		return fmt.Errorf("create hook: %w", err)
	}
	slog.Info("created webhook", "name", courtCommandHookName, "id", created.ID, "url", cfg.WebhookURL)
	r.WebhookSigningKey = created.SigningKey
	r.WebhookCreated = true
	return nil
}

func seedAPIUserRole(ctx context.Context, c *logto.Client, r *Result) error {
	if r.APIResourceID == "" {
		return fmt.Errorf("APIResourceID not set -- seedAPIResource must run first")
	}
	if r.BootstrapUserID == "" {
		return fmt.Errorf("BootstrapUserID not set -- seedBootstrapAdmin must run first")
	}
	role, err := c.FindRoleByName(ctx, apiUserRoleName)
	if err != nil {
		return fmt.Errorf("find role: %w", err)
	}
	if role == nil {
		created, err := c.CreateRole(ctx, logto.CreateRoleParams{
			Name:        apiUserRoleName,
			Description: "Grants every Court Command API scope. Assigned to dev/admin users so their JWTs carry write:profile, manage_*, etc.",
			Type:        "User",
		})
		if err != nil {
			return fmt.Errorf("create role: %w", err)
		}
		role = created
		slog.Info("created api user role", "name", apiUserRoleName, "id", role.ID)
	} else {
		slog.Info("api user role exists", "name", apiUserRoleName, "id", role.ID)
	}
	r.APIUserRoleID = role.ID

	allScopes, err := c.ListResourceScopes(ctx, r.APIResourceID)
	if err != nil {
		return fmt.Errorf("list resource scopes: %w", err)
	}
	bound, err := c.ListRoleScopes(ctx, role.ID)
	if err != nil {
		return fmt.Errorf("list role scopes: %w", err)
	}
	boundSet := make(map[string]bool, len(bound))
	for _, s := range bound {
		boundSet[s.ID] = true
	}
	var toBind []string
	for _, s := range allScopes {
		if !boundSet[s.ID] {
			toBind = append(toBind, s.ID)
		}
	}
	if len(toBind) > 0 {
		if err := c.AssignScopesToRole(ctx, role.ID, toBind); err != nil {
			var apiErr *logto.APIError
			if errors.As(err, &apiErr) && apiErr.Status == 422 {
				slog.Info("api role scope bindings already current (logto returned 422)")
			} else {
				return fmt.Errorf("assign scopes to role: %w", err)
			}
		}
	}
	slog.Info("api role scopes synced",
		"existing", len(bound), "added", len(toBind), "target", len(allScopes))

	if err := c.AssignRolesToUser(ctx, r.BootstrapUserID, []string{role.ID}); err != nil {
		var apiErr *logto.APIError
		if errors.As(err, &apiErr) && apiErr.Status == 422 {
			slog.Info("bootstrap admin already has api user role")
			return nil
		}
		return fmt.Errorf("assign role to user: %w", err)
	}
	slog.Info("granted api user role to bootstrap admin")
	return nil
}

func seedEmailConnector(ctx context.Context, c *logto.Client, cfg *Config) error {
	const (
		httpEmailConnectorID = "http-email"
		smtpConnectorID      = "simple-mail-transfer-protocol"
	)
	existing, err := c.ListConnectors(ctx)
	if err != nil {
		return fmt.Errorf("list connectors: %w", err)
	}
	var (
		existingHTTP *logto.Connector
		existingSMTP *logto.Connector
	)
	for i := range existing {
		switch existing[i].ConnectorID {
		case httpEmailConnectorID:
			existingHTTP = &existing[i]
		case smtpConnectorID:
			existingSMTP = &existing[i]
		}
	}

	if !cfg.SMTPConfigured() {
		if existingHTTP != nil {
			slog.Info("email connector exists (discard endpoint)", "id", existingHTTP.ID)
			return nil
		}
		created, err := c.CreateConnector(ctx, logto.CreateConnectorParams{
			ConnectorID: httpEmailConnectorID,
			Config: map[string]interface{}{
				"endpoint": "http://localhost:9999/discard",
			},
		})
		if err != nil {
			return fmt.Errorf("create http-email connector: %w", err)
		}
		slog.Info("registered http-email discard connector (no real email)", "id", created.ID)
		return nil
	}

	smtpConfig := map[string]interface{}{
		"host":   cfg.SMTPHost,
		"port":   cfg.SMTPPort,
		"secure": cfg.SMTPPort == 465,
		"auth": map[string]interface{}{
			"user": cfg.SMTPUser,
			"pass": cfg.SMTPPass,
		},
		"fromEmail": cfg.EmailFrom,
		"fromName":  cfg.EmailFromName,
		"templates": defaultEmailTemplates(),
	}

	if existingSMTP != nil {
		if _, err := c.UpdateConnector(ctx, existingSMTP.ID, logto.UpdateConnectorParams{
			Config: smtpConfig,
		}); err != nil {
			return fmt.Errorf("update SMTP connector: %w", err)
		}
		slog.Info("smtp connector reconfigured",
			"id", existingSMTP.ID, "host", cfg.SMTPHost, "port", cfg.SMTPPort, "from", cfg.EmailFrom)
	} else {
		created, err := c.CreateConnector(ctx, logto.CreateConnectorParams{
			ConnectorID: smtpConnectorID,
			Config:      smtpConfig,
		})
		if err != nil {
			return fmt.Errorf("create SMTP connector: %w", err)
		}
		slog.Info("registered smtp connector",
			"id", created.ID, "host", cfg.SMTPHost, "port", cfg.SMTPPort, "from", cfg.EmailFrom)
	}

	if existingHTTP != nil {
		if err := c.DeleteConnector(ctx, existingHTTP.ID); err != nil {
			slog.Warn("failed to delete leftover http-email connector", "id", existingHTTP.ID, "error", err)
		} else {
			slog.Info("removed leftover http-email discard connector", "id", existingHTTP.ID)
		}
	}
	return nil
}

func defaultEmailTemplates() []map[string]interface{} {
	tmpl := func(usageType, subject, intro string) map[string]interface{} {
		body := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
<h2 style="color: #111;">Court Command</h2>
<p>%s</p>
<p style="font-size: 28px; letter-spacing: 4px; font-weight: 700; padding: 16px 24px; background: #f3f4f6; border-radius: 8px; text-align: center; font-family: ui-monospace, monospace;">{{code}}</p>
<p style="color: #6b7280; font-size: 13px;">If you didn't request this code, you can safely ignore this email.</p>
</body></html>`, intro)
		return map[string]interface{}{
			"usageType":   usageType,
			"type":        "EmailTemplateType.Generic",
			"subject":     subject,
			"content":     body,
			"contentType": "text/html",
		}
	}
	return []map[string]interface{}{
		tmpl("Register", "Welcome to Court Command — verify your email", "Welcome! Your verification code is:"),
		tmpl("SignIn", "Court Command sign-in code", "Your sign-in code is:"),
		tmpl("ForgotPassword", "Reset your Court Command password", "Your password reset code is:"),
		tmpl("Generic", "Court Command verification code", "Your verification code is:"),
	}
}

func seedSignInExperience(ctx context.Context, c *logto.Client, cfg *Config) error {
	verify := cfg.EmailVerifyOnSignUp && cfg.SMTPConfigured()
	// Logto rejects an email/phone sign-up identifier unless verification
	// is enabled (sign_in_experiences.passwordless_requires_verify). With
	// no SMTP connector (local dev) we can't deliver a verification code,
	// so fall back to a username sign-up identifier. The bootstrap admin
	// still signs in via email+password (configured in SignIn.Methods
	// below); only NEW self-registration uses username in this mode.
	signUpIdentifier := logto.SignInIdentifierEmail
	if !verify {
		signUpIdentifier = logto.SignInIdentifierUsername
	}
	params := logto.UpdateSignInExperienceParams{
		SignIn: &logto.SignInConfig{
			Methods: []logto.SignInMethod{
				{
					Identifier:        logto.SignInIdentifierEmail,
					Password:          true,
					VerificationCode:  cfg.SMTPConfigured(),
					IsPasswordPrimary: true,
				},
				{
					Identifier:        logto.SignInIdentifierUsername,
					Password:          true,
					VerificationCode:  false,
					IsPasswordPrimary: false,
				},
			},
		},
		SignUp: &logto.SignUpConfig{
			Identifiers: []logto.SignInIdentifier{signUpIdentifier},
			Password:    true,
			Verify:      verify,
		},
	}
	if err := c.UpdateSignInExperience(ctx, params); err != nil {
		return fmt.Errorf("update sign-in experience: %w", err)
	}
	slog.Info("sign-in experience configured", "signup_verify", verify, "magic_link", cfg.SMTPConfigured())
	return nil
}

// syncSportsOrgIDs writes the live org IDs into sports.logto_org_id.
// Runs inside the same transaction that holds the advisory lock so two
// concurrent api boots can't fight over the row.
func syncSportsOrgIDs(ctx context.Context, tx pgx.Tx, cfg *Config, r *Result) error {
	if r.PickleballOrgID == "" {
		return fmt.Errorf("PickleballOrgID not set -- seedOrganizations must run first")
	}
	tag, err := tx.Exec(ctx,
		"UPDATE sports SET logto_org_id=$1 WHERE slug='pickleball'",
		r.PickleballOrgID)
	if err != nil {
		return fmt.Errorf("update pickleball: %w", err)
	}
	pickleballRows := tag.RowsAffected()

	var demoRows int64
	if r.DemoSportOrgID != "" {
		tag, err := tx.Exec(ctx,
			"UPDATE sports SET logto_org_id=$1, is_active=true WHERE slug='demo_sport'",
			r.DemoSportOrgID)
		if err != nil {
			return fmt.Errorf("update demo_sport: %w", err)
		}
		demoRows = tag.RowsAffected()
	} else if !cfg.SeedDemoSport {
		// Production launch mode: hide Demo Sport from the picker.
		tag, err := tx.Exec(ctx,
			"UPDATE sports SET is_active=false WHERE slug='demo_sport'")
		if err != nil {
			return fmt.Errorf("deactivate demo_sport: %w", err)
		}
		slog.Info("demo sport hidden from picker", "rows", tag.RowsAffected())
	}
	slog.Info("synced sports.logto_org_id",
		"pickleball_rows", pickleballRows, "demo_sport_rows", demoRows)
	if pickleballRows == 0 && demoRows == 0 {
		slog.Warn("zero sports rows updated -- did migrations run?")
	}
	return nil
}
